# BounceMail

BounceMail is an open source, full stack web application designed to automatically extract key personnel from unstructured text inputs and verify their corporate email addresses using live SMTP pinging. It eliminates the need for manual email scraping by leveraging Large Language Models to parse corporate bios or news excerpts, generate likely email permutations, and safely test them against root mail servers.

Because it uses raw TCP sockets on Port 25 to perform SMTP handshakes, this tool is designed specifically to be run locally or on a dedicated VPS. Most serverless cloud providers block Port 25, making local execution the best way to utilize the system without third party API costs.

## Key Features

* AI Extraction: Parses unstructured corporate descriptions, LinkedIn bios, or news excerpts to identify companies, root domains, and founders.
* Bring Your Own Key: Client side configuration allows users to input their own OpenAI or Anthropic API keys, stored securely in local storage.
* Live SMTP Validation: Custom SMTP handshake logic verifies email existence without sending actual payload emails.
* Catch All Detection: Automatically identifies and flags domains that accept all incoming mail, preventing false positives.
* Direct Check: Standalone mode to manually verify a single target email address.

## Prerequisites

* Node.js v18 or higher.
* Git installed on your local machine.

## Local Installation and Setup

Follow these steps to get the platform running locally on your machine.

1. Clone the repository:
`a`mal
git clone https://github.com/shravanxd/bounce-mail.git
cd bounce-mail
```

2. Install dependencies:
Run the following command in the root directory to install all required packages:
`a`mal
npm install
```

3. Start the application:
This project uses a unified structure. By running the development command, both the Vite frontend and the Express backend API will start concurrently:
`a`mal
npm run dev
```

4. Access the platform:
Open your web browser and navigate to:
`a`mal
http://localhost:5173
```

## Environment Configuration (Optional)

While the application utilizes a Bring Your Own Key interface for user driven API usage, a local .env file can be placed at the root of the project for backend fallbacks during development. 

Required variables if bypassing client keys:
* OPENAI_API_KEY: Your OpenAI API Key.
* ANTHROPIC_API_KEY: Your Anthropic API Key.

## How It Works Under The Hood

1. Text Input: The user pastes an unstructured bio or corporate excerpt into the AI Extract interface.
2. LLM Processing: The frontend passes the text and the configured API key to the backend. The backend constructs a structured prompt forcing the LLM to return JSON containing the entity name, root domain, and an array of key personnel.
3. Permutation Generation: For each extracted person, the system generates common corporate email patterns.
4. DNS and SMTP Handshake: The backend resolves the MX (Mail Exchange) records for the target domain and opens a raw TCP connection to the mail server on Port 25. It tests the generated addresses using RCPT TO commands, checking for 250 Valid or 550 Invalid response codes.
5. Real Time Feedback: The user interface streams the results dynamically.

## Important Note on Cloud Deployment

If you choose to deploy this to a cloud provider like AWS, DigitalOcean, or Vercel, you will likely encounter outbound Port 25 blocking. Serverless platforms like Vercel permanently block this port, which will cause the SMTP validation to fail. To deploy to a VPS, you must explicitly request your cloud provider to unblock outbound Port 25 to allow the live SMTP handshakes to function.

Powered by [BounceMail](https://www.bounce-mail.com/).

## Author

Developed by Shravan Khunti.