# Rank-Anything

## Project Overview
Rank-Anything is a web application that enables users to rate and review items organized in a two-level structure: topics and objects. Users can create custom topics, add objects within those topics, assign tags, and rate/review objects. The app features user authentication, daily limits, and community moderation. All data is now stored on the server (not in the browser).

---

## Architecture
- **Frontend:** Static HTML/CSS/JS (in `/frontend`), API-driven, deployable to GitHub Pages, Vercel, or Netlify.
- **Backend:** Node.js + Express + SQLite (in `/backend`), RESTful API, deployable to Render or any Node.js host.

---

## Deployment Instructions

### 1. Backend (Render)
1. Go to [Render.com](https://render.com/) and create a new Web Service.
2. Connect your GitHub repo and select the `/backend` folder as the root.
3. Set the build and start commands:
   - **Build Command:** (leave blank)
   - **Start Command:** `node index.js`
4. Add an environment variable (optional for JWT secret):
   - `JWT_SECRET=your_secret_key`
5. Deploy. Note your backend URL (e.g., `https://rank-anything-backend.onrender.com`).

### 2. Frontend (GitHub Pages, Vercel, or Netlify)
1. Copy the contents of `/frontend` to a new repo or branch (or keep in the same repo).
2. Set the `BACKEND_URL` at the top of `frontend/script.js` to your Render backend URL.
   ```js
   const BACKEND_URL = 'https://your-backend-url.onrender.com';
   ```
3. Deploy `/frontend` as a static site:
   - **GitHub Pages:** Set source to `/frontend` folder or branch.
   - **Vercel/Netlify:** Import the repo and select `/frontend` as the root.

---

## Usage Guide
- **Register/Login:** Create an account to use all features.
- **Topics:** Create, view, edit, and delete topics.
- **Objects:** Add objects to topics, assign tags, edit, and delete.
- **Tags:** Assign multiple tags to objects for categorization and filtering.
- **Ratings/Reviews:** Rate objects (1-5 stars) and leave reviews. Edit your own reviews.
- **Daily Limits:** 4 topics, 32 objects, 64 ratings per user per day.
- **Moderation:** Propose edits/deletes for content you don't own. Vote and execute proposals as a community.

---

## API Endpoints (Backend)
- `POST /api/register` — Register a new user
- `POST /api/login` — Login and receive JWT
- `GET /api/topics` — List topics
- `POST /api/topics` — Create topic (auth)
- `PUT /api/topics/:id` — Edit topic (auth, owner)
- `DELETE /api/topics/:id` — Delete topic (auth, owner)
- `GET /api/topics/:topicId/objects` — List objects in topic
- `POST /api/topics/:topicId/objects` — Create object (auth)
- `PUT /api/objects/:id` — Edit object (auth, owner)
- `DELETE /api/objects/:id` — Delete object (auth, owner)
- `GET /api/tags` — List tags
- `POST /api/tags` — Create tag (auth)
- `POST /api/objects/:objectId/tags` — Assign tags (auth, owner)
- `GET /api/objects/:objectId/tags` — List tags for object
- `GET /api/objects/:objectId/ratings` — List ratings/reviews
- `POST /api/objects/:objectId/ratings` — Create/update rating (auth)
- `GET /api/moderation/proposals` — List proposals (auth)
- `POST /api/moderation/proposals` — Create proposal (auth)
- `POST /api/moderation/proposals/:id/vote` — Vote on proposal (auth)
- `POST /api/moderation/proposals/:id/execute` — Execute proposal (auth)

---

## Notes
- All data is now stored on the server (SQLite DB in backend).
- The frontend is fully API-driven and does not use localStorage for app data.
- For production, use HTTPS for both frontend and backend.
- You can use any static host for the frontend and any Node.js host for the backend.

---

## License
MIT 