# BounceMail

BounceMail is a full stack web application designed to automatically extract key personnel from unstructured text inputs and verify their corporate email addresses using live SMTP pinging. It eliminates the need for manual email scraping by leveraging Large Language Models to parse corporate bios or news excerpts, generate likely email permutations, and safely test them against root mail servers.

## Key Features

* AI Extraction: Parses unstructured corporate descriptions, LinkedIn bios, or news excerpts to identify companies, root domains, and founders.
* Bring Your Own Key: Client side configuration allows users to input their own OpenAI or Anthropic API keys, stored securely in local storage.
* Live SMTP Validation: Custom SMTP handshake logic verifies email existence without sending actual payload emails.
* Catch-All Detection: Automatically identifies and flags domains that accept all incoming mail, preventing false positives.
* Direct Check: Standalone mode to manually verify a single target email address.
* Vercel Ready: Unified monorepo structure optimized for Vercel Serverless Functions deployment.

## Architecture

The application is built with a modern, decoupled architecture designed to run seamlessly on Vercel.

* Frontend: React, Vite, Tailwind CSS, Framer Motion for fluid animations.
* Backend: Node.js, Express, utilizing the native net and dns modules for raw network and MX record lookups.
* Routing: Vercel configuration (vercel.json) explicitly rewrites /api traffic to the Express serverless endpoints.

## Prerequisites

Node.js v18 or higher is recommended for local development.

## Local Development Setup

1. Clone the repository to your local machine.
2. Install the project dependencies securely from the root directory using npm install.
3. Start the development environment, which concurrently runs the Vite frontend and the Express backend API using npm run dev.
4. Access the application in your browser at http://localhost:5173.

## Environment Configuration

While the application utilizes a Bring Your Own Key interface for user driven API usage, a local .env file can be placed at the root of the project for backend fallbacks during development. 

Required variables if bypassing client keys:
* OPENAI_API_KEY: Your OpenAI API Key.
* ANTHROPIC_API_KEY: Your Anthropic API Key.
* SMTP_SENDER_EMAIL: A valid fallback email address utilized in the MAIL FROM SMTP handshake phase.

## Deployment to Vercel

The repository is structured specifically for zero configuration Vercel deployments.

1. Import the repository into your Vercel dashboard.
2. The framework preset should automatically be detected as Vite.
3. Keep the root directory as the default.
4. Add any default environment variables in the Vercel project settings.
5. Click Deploy. Vercel will automatically build the frontend and map the api/index.js file as a serverless function based on the vercel.json specifications.

## How It Works Under the Hood

1. Text Input: The user pastes an unstructured bio or corporate excerpt into the AI Extract interface.
2. LLM Processing: The frontend passes the text and the configured API key to the backend. The backend constructs a structured prompt forcing the LLM to return JSON containing the entity name, root domain, and an array of key personnel.
3. Permutation Generation: For each extracted person, the system generates common corporate email patterns such as first.last, firstinitial_last, etc.
4. DNS and SMTP Handshake: The backend resolves the MX (Mail Exchange) records for the target domain and opens a raw TCP connection to the mail server. It tests the generated addresses using RCPT TO commands, checking for 250 (Valid) or 550 (Invalid) response codes.
5. Real Time Feedback: The user interface streams the results dynamically, updating the status of each permutation in real time.

## Author

Developed by Shravan Khunti.