# Examination Malpractice Reporting & Review System

A full-stack web application for managing examination malpractice reports from submission through review, escalation, senate verdict, and closure. The platform supports multiple roles including students, invigilators, officers, senate members, and super administrators.

## Overview

This project provides a workflow-based system for:

- Creating and tracking malpractice reports
- Uploading evidence and supporting exhibits
- Assigning review roles across academic and administrative stages
- Recording officer and senate action history
- Managing notifications and status updates
- Restricting access by role and workflow stage

The application is designed around a structured review pipeline so cases move in an auditable sequence rather than being handled ad hoc.

## Main Features

- Role-based authentication and authorization
- Student and invigilator report submission
- Multi-stage review flow
- Case status tracking and historical updates
- Evidence upload support with Cloudinary
- Email notifications using Resend
- Dashboard views for different user roles
- Audit trail for actions and updates
- Super-admin user and system management

## User Roles

The platform is structured for the following roles:

- Student
- Invigilator
- Exam Officer
- College Officer
- Registry Officer
- Senate Board
- Senate President
- Super Admin

Each role has permissions tailored to the malpractice review workflow and stage ownership rules.

## Tech Stack

### Frontend
- React
- Vite
- React Router DOM

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- JWT authentication
- bcryptjs password hashing

### Supporting Services
- Cloudinary for file storage
- Resend for email notifications
- Morgan for request logging
- CORS for cross-origin support

## Project Structure

```text
malpractice-system-full_1/
├── client/                     # React frontend
│   ├── src/                   # Frontend source files
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                     # Express backend
│   ├── config/                # MongoDB, roles, workflow, Cloudinary configs
│   ├── controllers/           # Request handlers
│   ├── middleware/            # Auth, RBAC, upload, error handling
│   ├── models/                # Mongoose schemas
│   ├── routes/                # API endpoints
│   ├── services/              # Notification, workflow, upload helpers
│   ├── utils/                 # Error and async utility helpers
│   ├── scripts/               # Migration and admin scripts
│   ├── seedAdmin.js           # Create initial super admin
│   ├── server.js              # App entry point
│   └── package.json
├── .gitignore
├── README.md
└── package.json (if added later by repo root configuration)
```

## Prerequisites

Before running this project, make sure you have:

- Node.js 18 or newer
- npm or yarn
- MongoDB running locally or a MongoDB Atlas connection string
- Cloudinary account for uploaded evidence
- Resend account for email notifications

## Environment Setup

Create a `.env` file inside the `server` directory with the following variables:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/malpractice-system
JWT_SECRET=replace-with-a-strong-secret-key
JWT_EXPIRES_IN=1d

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=no-reply@example.com
```

Notes:
- `CLIENT_URL` should match your frontend URL during local development.
- `MONGO_URI` must point to a valid MongoDB database.
- `JWT_SECRET` should be a strong random value.

## Installation

### 1) Install backend dependencies

```bash
cd server
npm install
```

### 2) Install frontend dependencies

```bash
cd ../client
npm install
```

## Running the Project

### Start the backend

```bash
cd server
npm run dev
```

The backend runs on:

- `http://localhost:5000`

### Start the frontend

```bash
cd client
npm run dev
```

The frontend runs on:

- `http://localhost:5173`

## Health Check

The backend exposes a health route:

```bash
GET http://localhost:5000/api/health
```

This should return a JSON response indicating the server is running.

## Initial Admin Setup

The project includes a helper script to create the first super admin user.

```bash
cd server
node seedAdmin.js admin@example.com StrongPassword123 "Super Admin"
```

This creates a `super_admin` account in the database using the provided email and password.

## Typical Workflow

1. A student or invigilator submits a report.
2. The case progresses through review stages.
3. Officers add notes and escalate the case as required.
4. Senate members review and provide decision support.
5. The Senate President records the final verdict.
6. The case is closed after the verdict is completed.

## API Structure

The backend exposes routes under `/api`:

- `/api/auth`
- `/api/admin`
- `/api/reports`
- `/api/notifications`
- `/api/senate`

## Production Build

For the frontend:

```bash
cd client
npm run build
```

For the backend, run the production server using:

```bash
cd server
npm start
```

## Notes

- The project uses a role-driven workflow and not just simple CRUD access.
- File and notification integration are configured through environment variables.
- The workflow logic is centralized in the backend configuration files, making it safer to manage policy changes over time.

## License

This repository does not currently include a license file. If you plan to share or deploy it publicly, add a license such as MIT or Apache 2.0.

## Contributing

If you want to contribute:

1. Create a feature branch.
2. Make your changes.
3. Run app checks locally.
4. Submit a pull request with a clear summary.

## Support

For setup issues, check:

- MongoDB connectivity
- `.env` variables
- Cloudinary credentials
- Resend API configuration
- Node and npm versions

If needed, review the backend logs and confirm that the database connection and required services are available.
