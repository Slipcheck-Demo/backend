# Betway Nigeria — API contract (наша собственная верификация)

> Все запросы ниже выполнены вживую 2026-09-16 через `curl`, без cookies/авторизации,
> напрямую с домашней машины (не браузер). Это единственный источник истины для реализации;
> Ниже отмечены места, где наши результаты **совпали** с референсом, и три места, где мы
> **зафиксировали расхождение** — их нужно учитывать в бэкенде.

## 1. Домены (подтверждено)

| Key | Base URL |
|---|---|
| `configDomain` | `https://config.betwayafrica.com` |
| `apicDomain` | `https://apic.betwayafrica.com/api` |
| `feeds` | `https://feeds-roa2.betwayafrica.com/br/_apis/sport/v1` |
| `bettingDomain` | `https://www.betway.com.ng/appsynapse/bet-api-sr` |

Все запросы отработали как плоский `fetch`/`curl` без заголовков сверх `Content-Type:
application/json` на POST — CORS/Cloudflare не блокируют JSON API, только HTML-документ.

## 2. DECODE — `POST .../v2/Betting/FindBookABet`

```
POST https://www.betway.com.ng/appsynapse/bet-api-sr/v2/Betting/FindBookABet
Content-Type: application/json

{ "countryCode": "NG", "bookingCode": "BW72B383EE", "cultureCode": "en-US" }
```

Успешный ответ (`200`) — подтверждено на коде, который мы сами создали шагом ниже
(`BW72B383EE`, один outcome):

```json
{
  "selections": [
    {
      "outcomeId": "7469919811",
      "marketId": "746991981",
      "marketName": "1X2",
      "outcomeName": "Chelsea FC (Nathan)",
      "eventId": 74699198,
      "eventName": "Chelsea FC (Nathan) vs. Tottenham Hotspur FC (Kai)",
      "eventEpoch": 1789545600,
      "priceDecimal": 2.26,
      "priceNumerator": 63,
      "priceDenominator": 50,
      "isMarketActive": true,
      "isEventActive": true,
      "isOutcomeActive": true,
      "market": { "isSuspended": false },
      "sportEvent": { "isFinished": false },
      "outcome": { "isTradingActive": true }
    }
  ],
  "isBuildABet": false,
  "isSingleBet": false,
  "accountId": "00000000-0000-0000-0000-000000000000"
}
```

**Шесть сигналов "мёртвой ножки"** (подтверждено структурой ответа): верхнеуровневые
`isMarketActive`/`isEventActive`/`isOutcomeActive` + вложенные `market.isSuspended`,
`sportEvent.isFinished`, `outcome.isTradingActive`. Ножка годна для ставки, только если все
шесть согласны — вложенные три легко упустить, суспендированный маркет всё равно отдаёт
`isMarketActive: true` наверху.

Ошибка на неизвестном коде (`400`, подтверждено):

```json
{ "errorCode": 6000331, "errorMessage": "BookABetInvalidCode", "responseMetadata": null }
```

### ⚠️ Расхождение №1 — rate limit, которого нет в референсе

При частых последовательных запросах к `FindBookABet` (несколько подряд без паузы) сервис
один раз ответил не ожидаемой `BookABetInvalidCode`, а:

```json
{ "errorCode": 6000359, "errorMessage": "BookABetLimitExceeded", "responseMetadata": null }
```

`400`. После паузы ~5с запрос с тем же телом отработал штатно. **Вывод для бэкенда:** между
собственными запросами к decode/encode нужен небольшой троттлинг или retry-with-backoff,
отдельно от уже описанного в референсе "один retry на транзиентный 400". `6000359` стоит
маппить так же, как транзиентную ошибку (retry), а не как `invalid_code`.

### ⚠️ Расхождение №2 — decode "мёртвого" outcomeId

Референс утверждает, что код, созданный из несуществующего `outcomeId` (`00000000000`),
декодируется как `200 {"selections": []}`. При нашей проверке (2026-09-16) тот же
`outcomeId` дал **тот же самый код** `BW6E59F360` (см. §3 — encode детерминирован по
содержимому), но его decode вернул:

```json
{ "errorCode": 6000332, "errorMessage": "BookABetSelectionsExpired", "responseMetadata": null }
```

`400`, не `200` с пустым массивом. **Вывод:** оба исхода (пустой `selections` и
`BookABetSelectionsExpired`) нужно трактовать бэкендом одинаково — как "код создан, но
ставить нечего" (`invalid_code`/dead-slip), не полагаясь на конкретную форму ответа. Живое
поведение могло измениться со стороны Betway между 2026-09-03 и 2026-09-16 — не полагаться
на фиксированную форму этого edge-кейса.

## 3. ENCODE — `POST .../v1/Betting/BookABet`

```
POST https://www.betway.com.ng/appsynapse/bet-api-sr/v1/Betting/BookABet
Content-Type: application/json

{
  "cultureCode": "en-US",
  "countryCode": "NG",
  "isSingleBet": false,
  "outcomes": [ { "outcomeId": "7469919811" } ]
}
```

Ответ (`200`, подтверждено): `{ "bookingCode": "BW72B383EE" }`.

**Round-trip decode ⇄ encode подтверждён** — созданный код сразу декодировался с тем же
`outcomeId`/`eventId`/`marketId` (см. §2).

**Encode детерминирован по содержимому `outcomes`** (наше наблюдение, не было явно в
референсе): повторная отправка `{"outcomeId":"00000000000"}` — того же несуществующего id,
что использовал референс 2026-09-03, — вернула **точно тот же** `bookingCode: "BW6E59F360"`,
что и в референсе две недели назад. Значит код — не случайный токен, а выводится
детерминированно (вероятно, хэш/id) из набора outcome ids. Это стоит учитывать в тестах: два
одинаковых запроса на encode дадут один и тот же код, это не race condition и не баг.

Пустой массив `outcomes` (подтверждено, `400`):

```json
{ "errorCode": 10, "errorMessage": "UnexpectedError", "responseMetadata": null }
```

**Конфликтующие селекшены одного события не валидируются** (подтверждено): отправка
`outcomeId` домашней победы и ничьей одного матча (`7469919811` + `7469919812`, событие
`74699198`) вернула `200` с валидным кодом, который декодируется с обеими ножками,
`isActive: true` у каждой. Бэкенд обязан сам проверять `selection.eventId` на дубликаты
после create и отклонять как `conflicting_selections`.

## 4. Каталог спортов — `GET config.betwayafrica.com/cron/sports/NG/en-US`

Подтверждено: **28** записей, из них **3** — не виды спорта, а промо-плитки
(`Codes`, `Swipe Bet`, `Betway Stream`), с `sportType: "Promo"` вместо `"Sport"`. Фильтровать
по `sportType === "Sport"` (25 реальных видов спорта: soccer, tennis, basketball, cricket,
rugby-union, american-football, boxing, table-tennis, volleyball, golf, formula-1,
aussie-rules, handball, ice-hockey, baseball, darts, speedway, water-polo, cycling,
badminton, futsal, lacrosse, snooker, pesapallo, floorball).

## 5. Upcoming-события — `GET feeds-roa2.../BetBook/Upcoming/`

```
GET .../BetBook/Upcoming/?countryCode=NG&sportId=soccer&Skip=0&Take=5&cultureCode=en-US
    &isEsport=false&boostedOnly=false&marketTypes=%5BWin%2FDraw%2FWin%5D
```

Форма ответа подтверждена — плоские, нормализованные массивы `events`/`markets`/`outcomes`/
`prices`, джойнятся по `eventId`/`marketId`/`outcomeId`. На выборке 5 событий: 1X2 маркет
всегда с 3 outcomes, индексы `[2,3,4]` (home, draw, away), средний всегда `"Draw"`,
`outcome.sbv` пустой. `outcomeId`-суффиксы `1,2,3` — тип, не позиция (см. §7).

Нюанс, которого не было явно в референсе: в текущей выборке (2026-09-16) большая часть
soccer-фикстур на ближайшие часы — **eSoccer** (`regionId: "esoccer"`), не живой футбол.
Это ожидаемо (eSoccer крутится каждые ~15 минут и доминирует в "upcoming" окне), но стоит
не удивляться при показе демо-данных.

## 6. Полный список маркетов события (squashed markets)

```
GET .../MarketGroupings/group-names?eventId={eventId}&countryCode=NG
GET .../MarketGroupings/MarketGroupNamesAndMarketsForEvent?eventId={eventId}
    &marketGroupId=Main&countryCode=NG&cultureCode=en-US&skip=0&take=20
    &isBuildABetOnly=false&searchQuery=
```

Squashed-markets поведение **полностью подтверждено** на живом событии (`eventId=74699198`,
группа `Main`, маркет Totals):

| | `isSquashedParent` | `isSquashedMarket` | `displayName` |
|---|---|---|---|
| parent | `true` | `false` | `"Total Goals"` — без линии |
| child | `false` | `true` | `"Total (5.5)"` — с линией |

Outcomes джойнятся на **child** id (`originalMarketId`), а не на `marketId` (который
указывает на parent):

```json
{
  "outcomeId": "7469919818total=5.5~12",
  "marketId": "7469919818",
  "originalMarketId": "7469919818total=5.5~",
  "name": "Over ",
  "sbv": " (5.5)"
}
```

**Правило подтверждено:** join по `outcome.originalMarketId ?? outcome.marketId`, затем
отбросить строки с `isSquashedParent: true` — иначе Total/Handicap маркеты дублируются, одна
копия пустая.

## 7. ID-схема (подтверждено структурой ответов)

- `eventId` (`74699198`) → `marketId` (`746991981`, = eventId + тип-код `1` для 1X2) →
  `outcomeId` (`7469919811`, = marketId + суффикс `1/2/3`).
- Суффикс — код типа исхода, не позиция; сортировать исходы нужно по полю `index`, не по
  суффиксу id.
- Squashed-маркеты (Totals/Handicap) кодируют параметр текстом: `"7469919818total=5.5~"`.

## 8. Публичный каталог букинг-кодов — `GET apic.betwayafrica.com/api/v1/Widget/BookingCodes`

### ⚠️ Расхождение №3 — каталог сейчас пуст

```
GET https://apic.betwayafrica.com/api/v1/Widget/BookingCodes?skip=0&limit=6&source=sportsradar
→ 200 { "total": 0, "nextSubset": 0, "data": [] }
```

Проверено многократно (2026-09-16, с задержками, с разными комбинациями query-параметров,
включая без `source`, с `countryCode=NG`, с `limit=20`) — стабильно `total: 0`. Референс
описывал 120 живых кодов на 2026-09-02/03. Также обратите внимание: форма ответа
отличается от референсной (`"nextSubset"` вместо непосредственно постраничного `skip`,
хотя `skip`/`limit` как query-параметры принимаются).

**Открытый вопрос — не блокирует старт, но влияет на дизайн:** нельзя полагаться на этот
эндпоинт для "популярных кодов" в пустом состоянии Decode-экрана прямо сейчас. Перед
реализацией этой части UI — перепроверить эндпоинт ещё раз (возможно, временная проблема
на стороне Betway/фида sportsradar); если долго остаётся пустым — использовать вместо этого
код, сгенерированный нами на живых upcoming-событиях (§5), как fallback для демо.

## 9. Платформенные заметки (подтверждено)

- Cloudflare защищает HTML-документ, не JSON API — подтверждено на каждом из проверенных
  эндпоинтов (GET и POST).
- Все запросы анонимны, без auth/signature/captcha.
- Наблюдался троттлинг на decode (см. Расхождение №1) — закладывать retry-with-backoff.

## 10. Итог для реализации backend

Все три операции (decode, encode, sport→event→market→outcome browse) подтверждены как
анонимные, доступные простым `fetch`/`curl` с Node без headless-браузера. Дополнительно к
плану из референса:

1. **Retry/backoff** на decode нужен не только для одного транзиентного 400, но и для
   `BookABetLimitExceeded` (6000359) — троттлить собственные исходящие запросы к Betway.
2. **Unbettable/dead-code detection** после encode должна проверять оба возможных ответа
   decode: `200` с пустым/уменьшенным `selections`, **и** `400 BookABetSelectionsExpired` —
   оба маппятся в один и тот же внутренний статус.
3. **Публичный каталог кодов сейчас недоступен как источник данных** — не проектировать
   Decode empty-state вокруг него без повторной проверки перед реализацией этого экрана.
