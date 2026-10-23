<p align="center"><img src="assets/github-cover.svg" alt="PO Tracker — From cells to a system." width="100%" /></p>

# PO Tracker

A multi-user purchase-order workspace with fast entry, revision history, workbook migration and an ambiguity-review queue.

**Django / DRF / React / TypeScript**

## What is included

Release 1 covers order entry/search, revision history and migration review. The current source includes exact-money and workbook-normalization improvements. Automated PDF extraction remains outside this release; no production pilot is claimed.

## Local setup

In `backend/`, create a Python virtual environment, install `requirements.txt`, configure `.env.example` values in your shell, then run `python manage.py migrate` and `python manage.py runserver`. In `frontend/`, run `npm ci` and `npm run dev`. Import only workbooks you are authorized to process. See the existing `docs/` for schema and migration details.

## Source and configuration

This repository is a source release. Local credentials, session cookies, personal records, databases, dependency directories and generated build files are excluded. See [SECURITY.md](SECURITY.md) before configuring integrations or contributing.

Current integration availability and physical-device behavior must be verified in your own environment. Historical project checks are not a promise that every external service works today.

---

Built by [Aman Singh](https://github.com/aman-singh27) · [More work](https://github.com/aman-singh27/aman-singh27/blob/main/PROJECTS.md)
