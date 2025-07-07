Part 1: Product Requirements Document (PRD)
Title: PRD: Anava Secure Cloud Installer
Version: 1.0
Date: July 7, 2025
Author: Gemini, Product Architect
Status: Proposed

1. Executive Summary
This document outlines the requirements for the Anava Secure Cloud Installer, a new, best-in-class deployment solution for the Anava ACAP's Google Cloud backend. The current vertexSetup_gcp.sh script is brittle, insecure, and presents a poor user experience. This project will replace it with an official, versioned Terraform module that customers will deploy via a guided, secure "Deploy to Cloud Shell" experience. This new method will drastically improve deployment success rates, enhance security, and align Anava with modern Infrastructure as Code (IaC) best practices, making the setup process accessible to any IT professional.

2. Problem Statement
The existing shell script for deploying the Anava cloud backend is a significant source of customer friction and a potential security liability. It suffers from several critical flaws:

Lack of Idempotency: The script cannot be re-run safely. If it fails midway, it can leave the project in a broken, indeterminate state.

Poor User Experience: It requires manual command-line execution, is intimidating to non-experts, and provides confusing output.

Security Risks: The script requires users to run commands with broad permissions and does not follow the principle of least privilege.

Difficult to Maintain: The imperative script is hard to debug, update, and version control, leading to a high maintenance burden for the Anava team.

No Audit Trail: Customers have no easy way to review what changes will be made to their environment before execution.

3. Goals and Objectives
Goal: To create a secure, reliable, and user-friendly "one-click" deployment experience for the Anava cloud backend.

Objective 1: Increase the deployment success rate to >98%.

Objective 2: Reduce the median customer deployment time to under 15 minutes.

Objective 3: Eliminate all setup-related support tickets by providing a robust, self-service solution.

Objective 4: Establish a secure and maintainable Infrastructure as Code (IaC) foundation for all future cloud components.

4. Target Audience (Persona)
Name: "IT Ian"

Role: IT Manager / Systems Administrator at a mid-sized company.

Skills: Proficient with technology and comfortable with command-line interfaces, but is not a cloud architect or a full-time developer. Manages multiple SaaS products and internal systems.

Needs & Motivations: Ian values security, control, and predictability. He wants to know exactly what a third-party script will do to his company's environment. He prefers guided processes over reading lengthy documentation and needs to get the deployment done correctly so he can move on to his next task. He is wary of solutions that require him to grant broad, persistent permissions to external systems.

5. Core User Journey
Initiation: From the local Anava ACAP UI, Ian clicks a "Deploy Cloud" button.

Redirection: A new browser tab opens, launching him into Google Cloud Shell. He is already authenticated with his own Google account.

Guided Setup: The Cloud Shell environment automatically clones a Git repository and displays a simple tutorial in a side panel. The primary configuration file is open in the editor for his review.

Execution: The tutorial guides Ian to run two commands: terraform init and terraform apply.

Review & Confirmation: The apply command presents a clear plan of all resources to be created. Ian reviews this plan and types yes to confirm.

Deployment: The infrastructure is provisioned automatically over the next 5-10 minutes.

Completion: The terminal displays the necessary outputs (API Gateway URL, Secret Manager secret name). The tutorial guides him on how to retrieve the secret value.

Configuration: Ian copies the outputs and uses them to finalize the configuration of the ACAP.

6. Functional Requirements
6.1. The Public Terraform Module (anava-gcp-module)

The module must be published to a public Git repository (e.g., GitHub).

It must create all necessary GCP resources as defined in the vertexSetup_gcp.sh script, including: Service Accounts, custom IAM Roles, Cloud Functions, API Gateway (API, Config, Gateway), Firestore Database, Firebase/Storage Rules, Workload Identity Federation, and a restricted API Key.

Inputs (variables.tf): Must accept project_id, region, and a solution_prefix.

Outputs (outputs.tf): Must output the api_gateway_url and the api_key_secret_name.

Security: The API key must be stored as a version in Google Secret Manager. The module output will be the secret's name, not the key itself.

Documentation: The module's README.md must be comprehensive, detailing all variables, outputs, and resources created.

6.2. The "Deploy to Cloud Shell" Experience

A lightweight public Git repository must be created to host the customer-facing Terraform configuration.

This repository will contain a main.tf file that instantiates the public module.

A README.md file in this repository will serve as the in-Cloud Shell tutorial.

An official cloudshell_open URL will be constructed to orchestrate the user journey.

7. Technical & Non-Functional Requirements
Security: All Service Accounts must be granted permissions via fine-grained, custom IAM roles implementing the principle of least privilege.

Testing: The Terraform module must have a CI pipeline that runs static analysis (tflint, tfsec) and integration tests (e.g., Terratest) before any changes are merged.

Idempotency: The Terraform configuration must be fully idempotent, allowing it to be run multiple times without causing errors.

8. Out of Scope for V1
"Headless" UI: A fully automated UI that runs Terraform on the backend using customer-provided credentials is not in scope for V1 due to the security and trust implications.

Support for other cloud providers: This project is for Google Cloud Platform only.

9. Success Metrics
Deployment success rate > 98%.

Median time-to-deploy < 15 minutes.

Customer satisfaction score (CSAT) for the setup process > 4.5/5.

90% reduction in support tickets related to cloud setup.
