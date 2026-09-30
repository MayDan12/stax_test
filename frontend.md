# Stax Core Backend - Frontend Integration & Testing Guide (`frontend.md`)

This guide explains how a frontend application (React, Next.js, Vue, iOS, Android) integrates with the **Stax Core Backend** API, and provides a step-by-step walkthrough to test the entire system end-to-end.

---

## 1. General API Specifications

- **Base URL**: `http://localhost:8000/v1` by default (`PORT` in `.env` can override it)
- **Swagger Interactive Docs**: `http://localhost:8000/docs` by default
- **Authentication Header**: `Authorization: Bearer <accessToken>`
- **Content-Type**: `application/json`
- **Currency Rule (Kobo Math)**:
  - Financial values are stored and calculated in integer Kobo ($1\text{ NGN} = 100\text{ Kobo}$).
  - Prisma `BigInt` values are serialized as integer strings in JSON. Parse `amountKobo` without losing integer precision, then divide by `100` for Naira display; do not assume it is a JSON number.
  - Request fields explicitly named in Naira (for example, `targetNaira`, `fixedAmountNaira`, and `mandateLimitNaira`) take Naira amounts. Follow each endpoint's DTO contract rather than converting all request values to Kobo.

---

## 2. End-to-End User Flow & Integration Guide

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. Nickname &  │ ──► │ 2. Phone OTP &   │ ──► │  4. Profile      │ ──► │  5. KYC Identity │ ──► │ 6. Link Account  │
│  Contact Target │     │ 3. Email OTP     │     │  (First/Last Name)│    │ (BVN / NIN)      │     │  & Allocations   │
└─────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

### Phase 1: Passwordless Auth & Progressive Onboarding

#### 1. Step 1: Register (`POST /v1/auth/signup`)

- **Endpoint**: `POST /v1/auth/signup`
- **Payload**:
  ```json
  {
    "email": "user@staxmoney.com",
    "nickname": "Johnny",
    "phoneNumber": "+2348012345678"
  }
  ```
- **Behavior**: Creates a pending user and sends an email OTP. `firstName`, `lastName`, and `phoneNumber` are optional signup fields.
- **Note**: In development mode, the 6-digit OTP code is logged in the backend terminal console (`[DEV OTP DISPATCH]`).

#### 2. Step 2: Verify Email (`POST /v1/auth/verify/confirm`)

- **Endpoint**: `POST /v1/auth/verify/confirm`
- **Payload**:
  ```json
  {
    "target": "user@staxmoney.com",
    "code": "<6-DIGIT-OTP-FROM-CONSOLE>",
    "type": "EMAIL"
  }
  ```
- **Behavior**: Validates the OTP, marks the email verified, and returns JWT `accessToken` and `refreshToken`.

If a phone number was provided, request and verify a separate phone OTP using `POST /v1/auth/verify/send` and `POST /v1/auth/verify/confirm` with `type: "PHONE"`. The current account activation check requires verified email and first/last names; phone verification is tracked separately.

#### 3. Optional Phone Verification

- **Request**: `POST /v1/auth/verify/send`
  ```json
  {
    "target": "+2348012345678",
    "type": "PHONE"
  }
  ```
- **Confirm**:
  ```json
  {
    "target": "+2348012345678",
    "code": "<6-DIGIT-OTP-FROM-CONSOLE>",
    "type": "PHONE"
  }
  ```
- OTP confirmation also returns a token pair.

#### 4. Complete the Profile (`PATCH /v1/users/profile`)

- **Endpoint**: `PATCH /v1/users/profile`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Payload**:
  ```json
  {
    "firstName": "John",
    "lastName": "Doe"
  }
  ```
- **Behavior**: Updates user profile with first name and last name. Once email and legal names are provided, `accountStatus` automatically transitions from `PENDING` to `ACTIVE`.

#### 5. Passwordless Login (`POST /v1/auth/login`)

- **Endpoint**: `POST /v1/auth/login`
- **Payload**:
  ```json
  {
    "email": "user@staxmoney.com"
  }
  ```
- **Behavior**: Sends a 6-digit OTP verification code to the registered email address. Submit the OTP code via `POST /v1/auth/verify/confirm` to log in and receive session JWT tokens.

#### 6. Refresh Token Rotation (`POST /v1/auth/refresh`)

- **Endpoint**: `POST /v1/auth/refresh`
- **Payload**:
  ```json
  {
    "refreshToken": "<YOUR_REFRESH_TOKEN>"
  }
  ```
- **Behavior**: Invalidates the old refresh token and returns a new token pair. Attempting to reuse a revoked refresh token triggers emergency security revocation of all active sessions for that user.

---

### Phase 2: KYC Identity Verification

#### 1. Check Status (`GET /v1/kyc/status`)

- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `{ "tier": "TIER_0", "status": "UNVERIFIED" }`

#### 2. Submit BVN (`POST /v1/kyc/bvn`)

- **Payload**: `{ "bvn": "22123456789" }`
- **Response**: Computes HMAC-SHA256 hash for deduplication and upgrades status to `PENDING` verification.

#### 3. Submit NIN (`POST /v1/kyc/nin`)

- **Payload**: `{ "nin": "22123456789" }`

---

### Phase 3: Bank Account Linking & Direct Debit Mandate Authorization

#### 1. Link Bank Account (`POST /v1/accounts/link`)

- **Payload**:
  ```json
  {
    "code": "code_mock_gtbank_123"
  }
  ```
- **Response**:
  ```json
  {
    "message": "Bank account linked successfully",
    "bankConnection": {
      "id": "conn_uuid_here",
      "providerAccountId": "acc_mock_xxxxxx",
      "bankName": "Guaranty Trust Bank (Mock)",
      "accountNumberMasked": "******4321",
      "mandateStatus": "PENDING",
      "mandateLimitKobo": "0"
    }
  }
  ```

#### 2. Authorize Direct Debit Mandate Ceiling (`POST /v1/accounts/:id/mandate`)

- **Endpoint**: `POST /v1/accounts/<CONNECTION_ID>/mandate`
- **Payload**:
  ```json
  {
    "mandateLimitNaira": 500000
  }
  ```
- **Behavior**: Sets direct-debit ceiling limit to ₦500,000 (`50000000` Kobo) and activates mandate status (`ACTIVE`).

#### 3. List Connected Accounts (`GET /v1/accounts`)

- Retrieves user's linked bank connections and active mandate limits.

---

### Phase 4: Destination Buckets & Versioned Allocation Rules

#### 1. Create Destination Buckets (`POST /v1/buckets`)

Create user destination buckets:

- **Bucket 1**: `{ "name": "Emergency Vault", "targetNaira": 1000000 }`
- **Bucket 2**: `{ "name": "Investments", "targetNaira": 500000 }`
- **Bucket 3**: `{ "name": "Bills & Utilities", "targetNaira": 200000 }`

#### 2. List Buckets (`GET /v1/buckets`)

- **Response**: Note down the UUID `id` of each bucket.

#### 3. Submit Versioned Allocation Rule (`POST /v1/rules`)

- **Payload**:
  ```json
  {
    "minSalaryNaira": 50000,
    "allocationRateBasisPoints": 3000,
    "splits": [
      {
        "bucketId": "<EMERGENCY_BUCKET_UUID>",
        "percentageBasisPoints": 4000,
        "priority": 1
      },
      {
        "bucketId": "<INVESTMENTS_BUCKET_UUID>",
        "percentageBasisPoints": 4000,
        "priority": 2
      },
      {
        "bucketId": "<BILLS_BUCKET_UUID>",
        "percentageBasisPoints": 2000,
        "priority": 3
      }
    ]
  }
  ```
- **Explanation**:
  - `minSalaryNaira`: ₦50,000 minimum threshold to trigger automated allocation.
  - `allocationRateBasisPoints`: the portion of a qualifying salary credit to allocate (`3000` = 30%).
  - Bucket percentages must total exactly `10000` basis points. They divide the allocation pool, not the whole salary.
  - For a ₦250,000 salary, Stax allocates ₦75,000: ₦30,000 to Emergency, ₦30,000 to Investments, and ₦15,000 to Bills. The remaining ₦175,000 stays in the source account.
  - Submitting new rules automatically deactivates prior rules and increments version (`v1 -> v2`).

#### 4. View Active Rule (`GET /v1/rules/active`)

- Returns currently active allocation rule version and bucket splits.

---

### Phase 5: Webhook Ingestion, Salary Classification & Allocation Engine

#### 1. Simulate Salary Credit Webhook (`POST /v1/webhooks/simulate-credit`)

- **Endpoint**: `POST /v1/webhooks/simulate-credit`
- **Payload**:
  ```json
  {
    "providerAccountId": "acc_mock_xxxxxx",
    "amountNaira": 250000,
    "narration": "MONTHLY SALARY PAYMENT FEB 2026",
    "counterparty": "ACME CORP PAYROLL"
  }
  ```
- **Immediate response**: The API stores a `RawTransaction` and returns `status: "queued"`, a transaction ID, and a queue job ID. Processing happens asynchronously, so the plan may not exist immediately after this response.
- **Worker pipeline**:
  1. The worker loads the raw transaction. For credits, `IncomeService` checks the amount threshold and salary/payroll narration or counterparty signals; non-salary credits are classified but do not receive an allocation plan.
  2. For a classified salary, `AllocationsService` calculates the plan:
  - Source salary: ₦250,000 (`25000000` Kobo).
  - Allocation rate: 30% (`3000` basis points), producing a ₦75,000 pool (`7500000` Kobo).
  - Emergency (40% of pool): ₦30,000.
  - Investments (40% of pool): ₦30,000.
  - Bills (20% of pool): ₦15,000.
  - The unallocated ₦175,000 remains in the source account.
  - If the mandate ceiling is exceeded, the plan is marked `CANCELLED`; otherwise, it starts as `CREATED`.
  - The plan includes `TransferInstruction` records with deterministic idempotency keys (`stax_tx_<planId>_<bucketId>_v<ruleVersion>`).
  3. The worker posts balanced ledger entries for the ₦75,000 pool, then calls the payment provider for each transfer. Successful transfers update the plan to `COMPLETED`; any failed transfer results in `PARTIALLY_FAILED`.

The payment step requires a mandate reference on the linked bank connection. The local mock provider is selected with `USE_MOCK_BANKING=true`.

Cancelled plans are not posted to the ledger or dispatched for payment. Ledger and payment services also verify that transfer totals equal the allocation pool and do not exceed the source salary.

#### 2. Get Allocation Execution History (`GET /v1/allocations/history`)

- **Endpoint**: `GET /v1/allocations/history`
- **Response**: Returns history of generated allocation plans and individual bucket transfer instructions.

Poll this endpoint after receiving the queued response to observe processing results. There is currently no public queue-job status endpoint. The development-only `POST /v1/allocations/trigger/:rawTransactionId` generates a plan synchronously, but it does not run the worker's ledger and payment steps.

### What is not exposed in this flow yet

Ledger posting and payment dispatch run from the ingestion worker and their results are not returned by the simulate-credit HTTP response. Audit and reconciliation services exist, but they are not currently invoked by this worker and do not have public API endpoints. Do not treat allocation history as proof that a transfer settled; check transfer and plan statuses, and use provider confirmations when available.

---

## 3. Step-by-Step Interactive Swagger Testing Guide

To test the backend interactively in 5 minutes:

1. Start PostgreSQL and Redis, then run the API with `pnpm run start:dev`. Open **`http://localhost:3000/docs`** (or use the configured `PORT`).
2. **Sign Up**:

- Expand `POST /v1/auth/signup` $\rightarrow$ Click **Try it out** $\rightarrow$ submit email, nickname, and optional phone number.
- Look at backend terminal logs for the email OTP (`[DEV OTP DISPATCH]`).

3. **Verify Email and Authorize Swagger**:

- Expand `POST /v1/auth/verify/confirm` $\rightarrow$ submit the email OTP with `type: "EMAIL"`.
- Copy `accessToken` from the response and use Swagger's **Authorize** button.

4. **Complete Profile**:

- Expand `PATCH /v1/users/profile` and submit first and last name. Verify the account state from `GET /v1/users/me`.
- If using phone verification, request and confirm its OTP separately; it is not required by the current activation condition.

5. **Log In when returning**:
   - Expand `POST /v1/auth/login` $\rightarrow$ Execute with credentials.

- Confirm the emailed OTP through `POST /v1/auth/verify/confirm` to receive a token pair.

6. **Link Bank Account**:
   - Expand `POST /v1/accounts/link` $\rightarrow$ Send `{ "code": "mock_code" }`.
   - Copy `providerAccountId` and `id` from response.
7. **Set Mandate Ceiling**:
   - Expand `POST /v1/accounts/{id}/mandate` $\rightarrow$ Send `{ "mandateLimitNaira": 500000 }`.
8. **Create Destination Buckets**:
   - Expand `POST /v1/buckets` $\rightarrow$ Create 3 buckets ("Emergency", "Investments", "Bills").
   - Expand `GET /v1/buckets` $\rightarrow$ Copy the 3 bucket UUIDs.
9. **Set Allocation Rule**:

- Expand `POST /v1/rules` $\rightarrow$ Set `allocationRateBasisPoints` to `3000` and add bucket weights totaling `10000` (for example, 4000, 4000, and 2000).

10. **Simulate Salary Webhook**:

- Expand `POST /v1/webhooks/simulate-credit` $\rightarrow$ Submit `{ "providerAccountId": "<providerAccountId>", "amountNaira": 250000 }`.

11. **Check Asynchronous Processing**:

- The simulate endpoint should return `status: "queued"` and a job ID.
- Poll `GET /v1/allocations/history` until the plan appears. Inspect the plan and individual transfer statuses; processing depends on Redis, the database, a valid mandate, and the configured payment provider.
