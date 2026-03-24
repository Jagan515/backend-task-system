# backend

This application is generated using [LoopBack 4 CLI](https://loopback.io/doc/en/lb4/Command-line-interface.html).

## API Documentation

### 1. Authentication
#### POST `/signup`
- **Description:** Register a new user account.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }
  ```
- **Response (200 OK):** User object (excluding password).

#### POST `/login`
- **Description:** Authenticate and receive a JWT.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbG..."
  }
  ```

### 2. User Management (Admin Only)
#### GET `/users`
- **Description:** List all users.
- **Response (200 OK):** Array of User objects.

#### POST `/users`
- **Description:** Create a user with a specific role.
- **Request Body:**
  ```json
  {
    "email": "manager@example.com",
    "password": "password123",
    "role": "manager",
    "firstName": "Jane",
    "lastName": "Smith"
  }
  ```

#### PATCH `/users/{id}`
- **Description:** Update user details or deactivation status.
- **Request Body:** Partial User object.

### 3. Task Management
#### POST `/tasks` (Manager/Admin)
- **Description:** Create a task and assign users.
- **Request Body:**
  ```json
  {
    "title": "Task Title",
    "description": "Task Description",
    "dueDate": "2024-12-31T23:59:59Z",
    "priority": "HIGH",
    "assignees": [1, 2]
  }
  ```

#### GET `/tasks`
- **Description:** List tasks. Users see assigned tasks; Managers/Admins see all.
- **Response (200 OK):** Array of Task objects.

#### PATCH `/tasks/{id}`
- **Description:** Update task. Includes Optimistic Locking.
- **Request Body:**
  ```json
  {
    "status": "IN_PROGRESS",
    "lastUpdatedAt": "2024-01-01T00:00:00Z"
  }
  ```

#### DELETE `/tasks/{id}` (Manager/Admin)
- **Description:** Delete a task.

#### Bulk Operations
- `PATCH /tasks/bulk`: Update multiple tasks (status, priority, dueDate).
- `POST /tasks/bulk-delete`: Delete multiple tasks.
- `PATCH /tasks/bulk-assign`: Assign multiple tasks to a set of users.

### 4. Collaboration
#### POST `/tasks/{id}/comments`
- **Description:** Add a comment to a task.
- **Request Body:** `{"content": "Comment text"}`

#### GET `/tasks/{id}/comments`
- **Description:** Retrieve comments for a task.

## Security & Permissions
- **RBAC:**
  - `user`: Can view assigned tasks and update status only.
  - `manager`: Can manage tasks they created.
  - `admin`: Full system control.
- **Optimistic Locking:** `PATCH /tasks/{id}` requires `lastUpdatedAt` to prevent overwrites.

## Install dependencies
```sh
npm install
```

## Run the application
```sh
npm start
```
Open http://127.0.0.1:3000 in your browser.

## Other useful commands
- `npm run migrate`: Migrate database schemas
- `npm run openapi-spec`: Generate OpenAPI spec
- `npm test`: Run tests
