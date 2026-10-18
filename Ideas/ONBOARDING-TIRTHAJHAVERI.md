# Onboarding Document - Tirtha Jhaveri

**Contributor:** Tirtha Jhaveri  
**GitHub:** [@02Tirtha](https://github.com/02Tirtha)  
**Date:** October 12, 2026  
**Repository:** [vicharanashala/fln](https://github.com/vicharanashala/fln)  
**Fork:** [02Tirtha/fln](https://github.com/02Tirtha/fln)  

---

## 1. What is FLN?

**FLN** stands for **Foundational Literacy and Numeracy**. It is an open-source, AI-driven educational assessment and personalized learning platform developed under the guidance of Vicharanashala Lab and IIT Ropar. The platform addresses a critical challenge in primary education across India and developing educational systems: ensuring that children in early grades (Balvatika through Class 4) acquire indispensable foundational skills in numeracy, mathematics, and reading before progressing to advanced academic levels.

### The Educational Problem
In conventional schooling systems, students are frequently promoted from grade to grade based on age or attendance rather than verified concept mastery. This practice causes cumulative learning deficits: a child in Class 3 who has not mastered single-digit addition or place value will struggle significantly with multi-digit subtraction, multiplication, and applied word problems. 

FLN systematically resolves this through:
- **Periodic Diagnostic Assessments**: Term-based diagnostics (Term 1, Term 2, Term 3) evaluating foundational numeracy strands (Counting, Place Value, Addition, Subtraction, Multiplication, Division, Geometry, Measurement, Patterns).
- **Sub-level Concept Mastery Tracking**: Granular tracking across a 109-level competency hierarchy aligned with NCF-FS standards.
- **Physical Paper + Digital Evaluation Bridge**: Automated optical scanning (ICR/OCR) to ingest physical, pencil-and-paper student worksheets.
- **Dynamic Personalized Remediation**: Automated generation of targeted remediation worksheets addressing specific learning gaps identified from incorrect responses.

---

## 2. What do you understand by FLN (as a system)?

FLN is designed as an interconnected, multi-role system governed by strict administrative hierarchies, geographic scoping, and evaluation pipelines.

### Organizational Hierarchy & User Roles

```
                      ┌────────────────────────┐
                      │       SUPERADMIN       │ (Curriculum standards, system audit, global users)
                      └───────────┬────────────┘
                                  │
                      ┌───────────▼────────────┐
                      │      STATE ADMIN       │ (State-level policy, statewide performance)
                      └───────────┬────────────┘
                                  │
                      ┌───────────▼────────────┐
                      │     DISTRICT ADMIN     │ (District audits, school distribution)
                      └───────────┬────────────┘
                                  │
                      ┌───────────▼────────────┐
                      │      BLOCK ADMIN       │ (Block school monitoring, volunteer deployment)
                      └─────┬────────────┬─────┘
                            │            │
             ┌──────────────▼───┐    ┌───▼──────────────┐
             │   SCHOOL/PRINCIPAL│   │    VOLUNTEER     │ (Multi-school field deployment)
             └──────────────┬───┘    └───┬──────────────┘
                            │            │
             ┌──────────────▼────────────▼─────┐
             │             TEACHER             │ (Diagnostic testing, ICR scanning, remediation)
             └──────────────┬──────────────────┘
                            │
             ┌──────────────▼──────────────────┐
             │        CLASS & STUDENTS         │ (109-level mastery progression & certificates)
             └─────────────────────────────────┘
```

### Core Entities & Domain Model
1. **Student**: Central entity with masked Aadhaar (`aadharMasked`), numeric display ID (`displayId`), assigned school, class group, current level/sub-level, mastery history, and streak.
2. **Teacher & Volunteer**: Field actors who generate assessment papers, scan answer sheets via ICR, trigger remediation worksheets, and issue mastery certificates.
3. **School**: Institutional node with high-strength or low-strength classification, geographic linkage (`stateCode`, `districtCode`, `blockCode`), and paper generation lock mechanisms.
4. **Diagnostic Worksheet & Answer Key**: Physical papers rendered via Puppeteer from HTML templates, distributed to classrooms, and ingested back through optical scanning.
5. **Evaluation Report**: Structured output recording student score, passed levels, failed levels, identified misconception tags, and learning progression blockers.
6. **Remediation Ledger**: Persistent state tracking failed questions, mapped mathematical concepts, targeted practice variants, and generation lifecycle (`pending` → `generating` → `completed`).

### System Workflow
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  PHYSICAL    │────▶│  ICR / OCR   │────▶│  EVALUATION  │────▶│   REMEDIATION    │
│  DIAGNOSTIC  │     │  SCANNING    │     │  PIPELINE    │     │   GENERATION     │
│  EXAMINATION │     │  (Gemma 4)   │     │  (Metrics)   │     │   (Blueprints)   │
└──────────────┘     └──────────────┘     └──────────────┘     └────────┬─────────┘
                                                                        │
                                                                        ▼
                                                               ┌──────────────────┐
                                                               │ PRINTABLE TARGET │
                                                               │ REMEDIAL SHEET   │
                                                               └──────────────────┘
```

---

## 3. Current State of the Repository — What Has Been Done So Far

### Architecture & Monorepo Structure
The codebase is structured as an **npm-workspaces monorepo**:
- `frontend/`: React 19 application built with Vite and Tailwind CSS.
- `backend/`: Real Node/Express REST API in TypeScript running on port `:3000`. Concurrency-safe data store abstraction (`backend/src/db.ts`) with MongoDB Atlas support and local JSON fallback (`data/db.json`).
- `ai-services/`: Python evaluation pipeline executing multi-stage analysis (`0_auto_classify_questions.py`, `1_compare_answers.py`, `2_evaluate_child.py`, `3_generate_report.py`).

### Key Implemented Capabilities
1. **Hardened JWT Authentication & RBAC**: Real signed JWTs (`jsonwebtoken`) with `bcrypt` hash verification. Role-based scoping prevents horizontal privilege escalation (IDOR) across schools and districts.
2. **Deterministic Balvatika & Class 1–4 Registry**: Standardized 109-level curriculum registry mapping concepts across number sense, arithmetic, measurement, and geometry.
3. **Automated Diagnostic Paper Generation**: Server-side Puppeteer engine rendering print-ready A4 PDF question papers with answer keys.
4. **Single-Model Cloud ICR Scanning**: Standardized optical character recognition utilizing Ollama Gemma 4 with scan quality verification (brightness, blur, contrast).
5. **Competency Prerequisite Graph**: DAG validation in `competencyPrerequisites.ts` ensuring curriculum prerequisites are respected before certification.
6. **Remediation Service & Blueprint Engine**: Complete backend engine generating personalized practice sheets from failed diagnostic questions.

---

## 4. Gaps Observed in the Code

During architectural exploration and active feature implementation, the following key technical gaps were identified:

### Gap 1: Incomplete Geographic Scope Inheritance and Principal Privileges
- **Where**: `backend/src/routes/admin.ts`, `backend/src/routes/teachers.ts`, and `backend/src/auth.ts`
- **What**: When creating school administrators or principals, the backend did not automatically inherit `stateCode`, `districtCode`, and `blockCode` from the associated school entity. Furthermore, principals were restricted from registering teachers within their own schools, and volunteers could not be assigned to multiple low-strength schools.
- **Why it matters**: In rural administration, principals must be able to staff their schools without contacting state superadmins. Missing geographic scopes broke regional rollup queries for block and district dashboards.
- **Resolution**: Addressed in PR #520 with automatic geographic inheritance, principal school-scoping, and multi-school volunteer assignment arrays.

### Gap 2: Remediation Plan Ledger Security and Missing 404 Guards
- **Where**: `backend/src/routes/remediation.ts` (Lines 18, 59, 87, 112, 137)
- **What**: Access checks relied on `if (student && !canAccessStudent(...))`. When a non-existent student ID was passed, the condition evaluated to false, skipping authorization entirely. This permitted unauthorized users to generate and query ledgers for arbitrary student IDs.
- **Why it matters**: Allowed IDOR bypass and dirty ledger generation across schools.
- **Resolution**: Addressed by enforcing strict 404 validation across all five remediation endpoints (`POST /generate`, `GET /ledgers`, `POST /ledgers/:id/generate`, `GET /batch/:examId`, `GET /:studentId/:examId`) before permission checks.

### Gap 3: Missing Review Flags on Heuristic/Keyword Fallback Practice
- **Where**: `backend/src/services/remediation/blueprintEngine.ts` & `remediation.service.ts`
- **What**: When AI generation is disabled or unconfigured, the system uses keyword heuristics and numeric mutators. Off-target keyword matches (e.g., word-form questions falling back to skip-counting) were marked with `needsReview: false`.
- **Why it matters**: Teachers had no visible indication on the dashboard or worksheet that a practice set was generated via heuristic fallback rather than an exact concept blueprint.
- **Resolution**: Updated all fallback generation paths to explicitly flag items with `needsReview: true`.

### Gap 4: Monolithic Frontend God-Files & Legacy ICR Interceptors
- **Where**: `frontend/src/components/RoleDashboards.tsx` (2,700+ lines) & legacy mock interceptors
- **What**: Several frontend views remain monolithic god-files containing multiple role dashboards in a single file, increasing bundle size and risk of merge conflicts.
- **Why it matters**: Makes concurrent development difficult and increases regression risk during merges.

---

## 5. Ideas for the Project

### Idea 1: Database-Driven Remediation Architecture (`remediationConcepts`, `generatorConfigs`, `visualTemplates`, `questionConceptMappings`)
- **Proposal for Later**: Transition the current static dictionary (`conceptDictionary.json`) and generator registry in `blueprintEngine.ts` into a database-backed schema with four dedicated MongoDB collections:
  - `remediationConcepts`: Centralized taxonomy of educational concepts with keyword aliases and difficulty tags.
  - `generatorConfigs`: Per-concept generation constraints, number ranges, step sizes, and visual layouts.
  - `visualTemplates`: SVG and icon configurations for pictorial questions (tallies, clocks, finger counting).
  - `questionConceptMappings`: Direct mappings between curriculum question items and their remediation concepts.
- **Benefits**: Decouples mathematical curriculum authoring from backend code, allowing educators to update practice sets dynamically. (In this first PR version, ledgers are persisted in `remediationLedgers` with concepts resolved via `conceptDictionary.json`).

### Idea 2: Deepest-Gap-First Sequencing via Prerequisite DAG (#676, #677)
- **Concept**: When a student fails multiple diagnostic questions, traverse the competency prerequisite graph (`competencyPrerequisites.ts`) to locate the root foundational gap. Sequence remedial practice in a 3-stage blueprint: (1) Supported Example, (2) Focused Practice, and (3) Mixed Transfer Item.
- **Benefits**: Prevents superficial drill-and-practice by addressing the underlying conceptual blocker first.

### Idea 3: Offline-First Classroom PWA with IndexedDB Sync
- **Concept**: Integrate Service Worker caching and IndexedDB queueing for the ICR scanner interface.
- **Benefits**: Teachers in remote or low-connectivity rural schools can capture student answer sheets and grade offline, with automated background synchronization when internet connectivity is restored.

### Idea 4: Automated Remediation Trigger from Evaluation Reports (#678)
- **Concept**: Seamlessly trigger `remediationService.startGeneration()` inside `POST /api/students/:id/diagnostic/submit` whenever failed levels are detected, eliminating the need for a separate manual click while retaining asynchronous background processing.
- **Benefits**: Reduces cognitive load on teachers and ensures every struggling child immediately receives targeted practice.

---

## 6. Your Contribution

During my work on the FLN platform, I focused on **Role-Based Access Control (RBAC) Hardening**, **Remediation Plan Engine Architecture**, and **Student Access Security**:

### 1. RBAC & Geographic Scoping Hardening ([PR #520](https://github.com/vicharanashala/fln/pull/520))
- **Geographic Inheritance (#450)**: Implemented automated inheritance of `stateCode`, `districtCode`, and `blockCode` from school entities during school administrator registration.
- **Principal School Management (#444)**: Empowered principals to register and manage teachers within their own school boundaries.
- **Multi-School Volunteer Scoping (#456)**: Added support for `assignedSchools` arrays, allowing mobile volunteers to assist multiple rural institutions.
- **Verification Demo**: Built comprehensive verification test script (`backend/scripts/demo-user-scoping.ts`) proving geographic inheritance and RBAC boundaries.

### 2. Remediation Service & Blueprint Engine ([PR #376](https://github.com/vicharanashala/fln/issues/376), [PR #379](https://github.com/vicharanashala/fln/issues/379))
- **Remediation Service (`remediation.service.ts`)**: Built the complete teacher-triggered remediation service managing asynchronous background generation, response caching, and database persistence in the `remediationLedgers` collection.
- **Blueprint Engine (`blueprintEngine.ts`) & Routes (`routes/blueprint.ts`)**: Developed the blueprint generator producing targeted practice variants across Arithmetic, Place Value, Patterns, Measurement, and Geometry with numeric mutation, supported by REST endpoints for blueprint retrieval and test generation.
- **Zero-Key Deterministic Fallback**: Implemented a complete fallback chain ensuring reliable practice generation even when no external Gemini API key is configured.
- **Printable Remediation Worksheets**: Authored the printable worksheet formatter (`remediationFormatter.ts`) rendering student demographics, original questions, concept explanations, and targeted practice exercises (intentionally leaving out the student's incorrect answers).

### 3. Student Security & 404 Guards
- **Strict 404 Route Guards**: Hardened all 5 endpoints in `backend/src/routes/remediation.ts` against IDOR and non-existent student IDs.
- **Regression Check Suite**: Created `backend/src/__checks__/remediation-404.check.ts` to assert that unknown students consistently return 404 across all endpoints.
- **Teacher Review Flagging**: Configured keyword fallback practice items to default to `needsReview: true`, giving educators clear oversight over heuristic content.

### 4. ICR Scanner Integration & Documentation
- **Clean Scanner Integration**: Embedded the remediation trigger card into `frontend/src/components/IcrScanner.tsx` without extraneous merge diff noise.
- **Architecture Documentation**: Documented the API contracts, data flow, and background execution lifecycle in `backend/src/services/remediation/REMEDIATION_ARCHITECTURE.md`.

---
*Submitted with dedication to the FLN Platform and foundational learning equity.*
