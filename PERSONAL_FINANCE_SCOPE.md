# Personal Finance Management Module — Project Scope

## 1. Project Overview

I want to develop a personal finance management module within my existing Next.js dashboard.

The objective is to centralize and manage my personal financial information, including expenses, income, receipts, credit card and bank transactions, statements, and pay stubs.

The application should help me understand:
- How much money I earn and spend.
- Where my money goes.
- My monthly and annual cash flow.
- My spending by category, merchant, and payment method.
- Which transactions have supporting receipts.
- Which receipts have been matched to financial transactions.
- How my financial situation evolves over time.

This is a personal application intended for a single user, not a commercial accounting product.

The system should be modular, allowing features to be implemented gradually without major architectural changes.

## 2. Existing Application

The finance module must integrate into my existing Next.js dashboard.

Before implementation:
- Inspect the existing project structure, authentication, database, ORM, UI components, and conventions.
- Reuse existing technologies and patterns wherever practical.
- Do not create a separate application or database unless there is a compelling technical reason.
- Follow the existing styling and navigation structure.
- Avoid introducing unnecessary dependencies or infrastructure.

The finance module should have its own section within the existing dashboard.

## 3. Core Financial Concepts

The system must distinguish between the following entities.

### A. Financial Transactions

A transaction represents an actual financial movement or expense/income record.

Transactions may be:
- Manually entered.
- Imported from a credit card statement.
- Imported from a bank statement.
- Created from a receipt when appropriate.
- Linked to an income record.

Examples:
- A $60 restaurant purchase paid by credit card.
- A $200 Interac e-Transfer sent to someone.
- A $50 cash purchase without a receipt.
- A $1,500 payroll deposit.
- A $300 reimbursement received.
- A transfer between my own accounts.

A transaction does not require a receipt, statement, or supporting document.

Transactions should support:
- Date.
- Amount and currency.
- Description.
- Merchant or counterparty.
- Category.
- Financial account or payment method.
- Direction/type: expense, income, transfer, or adjustment.
- Source: manual or imported.
- Optional notes.
- Optional supporting documents.
- Optional links to receipts or income records.

Transactions must be editable, searchable, and filterable.

### B. Receipts

A receipt is supporting evidence for a purchase.

Receipts should store:
- Merchant/store name.
- Purchase date.
- Subtotal.
- Taxes.
- Tip, if applicable.
- Total.
- Currency.
- Payment method/account.
- Expense category.
- Optional notes.
- Original image or PDF.

A receipt can exist without a corresponding imported transaction.

A receipt can later be matched to a financial transaction.

A receipt should not automatically create a second expense when a matching transaction already exists.

### C. Income Records

An income record describes the origin and details of earnings.

Examples:
- Employment income.
- Freelance work.
- Interest.
- Gifts.
- Other income.

Employment income may include:
- Employer.
- Pay period.
- Pay date.
- Gross income.
- Income tax deductions.
- QPP/CPP.
- EI.
- QPIP.
- Other deductions.
- Net income.
- Original pay stub.

Income records may be linked to corresponding bank transactions.

The system must distinguish gross income from net income and avoid counting the same earnings twice.

### D. Financial Accounts

Financial accounts represent where money is held or how transactions are paid.

Examples:
- Chequing account.
- Savings account.
- Credit card.
- Cash.
- Other accounts.

Accounts should have a name, type, currency, and optional masked identifier.

Never store full credit card numbers, CVVs, or online banking credentials.

### E. Financial Documents

Documents represent uploaded files.

Supported documents include:
- Receipts.
- Credit card statements.
- Bank statements.
- Pay stubs.
- Other financial supporting documents.

Documents should be stored privately and linked to the appropriate financial records.

Files should not be publicly accessible through predictable URLs.

## 4. Expense Management

The application must support expenses regardless of whether supporting documents exist.

Examples:
- Credit card purchase with receipt.
- Credit card purchase without receipt.
- Interac e-Transfer.
- Cash payment.
- Debit purchase.
- Bank withdrawal.
- Expense entered manually before a statement is imported.

The user must be able to create an expense manually by entering the amount, date, description, category, payment account, and optional notes.

A receipt must never be mandatory.

The system should distinguish genuine expenses from transfers between owned accounts, credit card payments, refunds, and reimbursements.

## 5. Transaction Import and Reconciliation

The system should eventually support manually uploading CSV statements from financial institutions.

Imported transactions should be associated with the appropriate account.

The application should:
- Parse transactions from supported CSV formats.
- Allow review before committing an import.
- Detect likely duplicates.
- Match imported transactions to existing manually entered transactions.
- Suggest matches between transactions and receipts.
- Allow manual confirmation and correction of matches.
- Show transactions without supporting receipts.
- Show receipts without matching transactions.

Importing a statement must not duplicate expenses already entered manually.

Matching should initially use deterministic rules such as amounts, dates, accounts, and merchant names.

No AI is required.

## 6. Financial Reporting

The dashboard should eventually display:
- Total income.
- Total expenses.
- Net cash flow.
- Monthly and yearly trends.
- Spending by category.
- Spending by merchant.
- Spending by account.
- Income by source.
- Transactions missing receipts.
- Financial activity over selectable date ranges.

Reporting must avoid double-counting transactions, receipts, income records, and transfers.

For cash-flow reporting, use actual money movements where available. For income analysis, retain gross and net pay details separately.

## 7. Privacy and Security

This application will contain sensitive personal financial information.

Requirements:
- Use the existing authentication system.
- Protect every finance API endpoint.
- Store uploaded documents privately.
- Validate uploaded file types and sizes.
- Protect against unauthorized file access.
- Avoid logging sensitive financial information.
- Use secure database access and backups.
- Support deleting financial records and documents.
- Do not send financial information to external AI services.

The first version must not use AI.

## 8. Future Capabilities

The architecture should permit, but not implement yet:
- Local OCR for receipt and statement extraction.
- Locally hosted AI for document classification.
- Automatic transaction categorization.
- Selective Outlook document ingestion.
- Budget management.
- Recurring expense detection.
- Subscription tracking.
- Financial forecasting.

Do not implement these features prematurely.

## 9. Development Principles

- Build the project incrementally.
- Maintain compatibility between phases.
- Prefer simple, maintainable solutions.
- Use decimal-safe handling for monetary values.
- Store currency explicitly.
- Separate financial records from supporting documents.
- Preserve original imported information for auditing.
- Make imports idempotent.
- Avoid unnecessary data duplication.
- Provide clear validation and error handling.
- Ensure the UI works on desktop and mobile.
- Do not modify unrelated dashboard functionality.

## 10. Implementation Workflow

Before each development phase:
1. Read this scope.
2. Inspect the existing implementation.
3. Identify relevant database and architectural changes.
4. Explain the proposed approach and any significant trade-offs.
5. Implement only the requested phase.
6. Verify that existing functionality still works.
7. Summarize what was implemented and what remains.

Do not implement future phases unless explicitly requested.

The final objective is a unified personal finance dashboard, but each phase should remain independently usable.