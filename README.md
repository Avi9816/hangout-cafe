# 🌌 After Hours

After Hours is a collection of persistent digital places where people discover others through shared interests, form connections, and continue conversations in intimate private spaces.

Designed around a quiet, poetic, and atmospheric aesthetic, After Hours is a place you miss when you are away. It focuses on presence, shared trace memories, and long-lived spatial continuity rather than rapid-fire feeds or SaaS-style dashboards.

---

# ✨ Features

## 🌌 Atmospheric Spaces

Choose from multiple persistent public environments, each with its own visual atmosphere, custom weather system, and ambient sounds:

- **📚 Between The Pages**: A warm digital library for sharing books, quotes, recommendations, and thoughtful discussions.
- **🏙️ Rooftop**: A late-night city skyline. A casual place for low-pressure social discovery and conversations.
- **🌌 Northern Lights**: A quiet and contemplative space for reflections, daily prompts, and deeper anonymous thoughts.
- **📻 Vinyl Corner**: A warm record shop / late-night listening corner for music discovery, favorite albums, and shared musical tastes.

---

## 👥 Real-Time Presence

- Join public spaces or create private circles.
- See active wanderers and view live space participant counts.
- Observe activity and status updates in real time.
- Presence updates automatically upon joining, leaving, refreshing, or disconnecting.

---

## 🎬 Shared Media Sync (VHS)

Spaces support synchronized media playback using peer-to-peer streaming:
- VHS-style player interface.
- Play, pause, and seek synchronization.
- Automatic host recovery and transaction-based ownership transfer.
- Persistent media queue synced in real time.

---

## 📝 Space Memory & Traces

Spaces have history and soul. They remember what happened even when everyone is away:

- **📝 Note Wall**: Leave notes pinned to the space's walls for others to find. Notes survive page refreshes and room inactivity.
- **🧠 Space Soul & Echoes**: Each space determines its own "soul level" (Quiet, Remembered, Lived-in, or Old Soul) based on accumulated history. Space Echoes display a poetic trace log of past actions.
- **♻️ Restoration**: When a space becomes empty and is later returned to, its theme, active media state, queue, and notes are automatically restored.

---

# 🏗️ Architecture

After Hours uses a modular, EventBus-driven architecture to keep code decoupled and maintainable:

```text
src/
├── config/
├── constants/
├── core/
│   ├── EventBus.ts
│   ├── events.ts
│   └── Lifecycle.ts
├── engines/
│   ├── Environment.ts
│   ├── AudioEngine.ts
│   └── Cinematography.ts
├── media/
│   ├── YouTubeSync.ts
│   ├── SpotifyPlayer.ts
│   └── TorrentManager.ts
├── services/
│   └── Presence.ts
├── ui/
│   ├── SpatialUI.ts
│   └── AmbientFeed.ts
├── utils/
│   ├── roomSoul.ts
│   └── roomEchoes.ts
└── main.ts
```

### Decoupled Event System
All main services communicate through a centralized `EventBus` to prevent direct module coupling and facilitate robust real-time synchronization.

---

# 🔥 Firestore Architecture

The project uses Firestore subcollections to prevent write contention and scale efficiently. The database collections retain their original identifiers to ensure compatibility with existing security rules and schemas:

- **Spaces (Rooms) Root**: `rooms/{roomCode}`
- **Notes subcollection**: `rooms/{roomCode}/notes/{noteId}`
- **Presence subcollection**: `rooms/{roomCode}/presence/{userId}`
- **Queue subcollection**: `rooms/{roomCode}/queue/{queueItemId}`
- **History subcollection**: `rooms/{roomCode}/history/{historyId}`
- **Memories subcollection**: `rooms/{roomCode}/memories/{memoryId}`

---

# 🛠️ Tech Stack

- **Frontend**: Vite, TypeScript, HTML5, Vanilla CSS
- **Realtime / Auth**: Firebase Auth (Anonymous), Cloud Firestore
- **Media**: WebTorrent, YouTube Embed API, Spotify Embed API

---

# 🚀 Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Ensure you populate the Firebase credentials inside your `.env` file.

### 3. Start Development Server
```bash
npm run dev
```

### 4. Build Production Bundle
```bash
npm run build
```

---

# 📜 License

MIT License
