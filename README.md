# ☕ Hangout Café

A persistent, real-time social ambient space built with modern web technologies.

Hangout Café is designed as a collection of atmospheric shared rooms where people can gather, leave memories behind, watch media together, and inhabit persistent spaces that continue to exist even when everyone leaves.

Unlike traditional chat rooms, Hangout Café focuses on presence, atmosphere, shared media, and long-lived room continuity.

---

# ✨ Features

## 🌌 Atmospheric Rooms

Choose from multiple themed environments:

- 🚆 The Last Train
- 🌧️ Window Seat
- 📚 Between Pages
- 🌌 Northern Lights

Each room includes its own visual atmosphere and ambient mood.

Examples:

- Moving train lights
- Rain and lightning
- Floating library dust
- Aurora ribbons and stars

---

## 👥 Real-Time Presence

Users can:

- Join public rooms
- Create private rooms
- See active participants
- View live participant counts
- Observe room activity in real time

Presence updates automatically when users:

- Join
- Leave
- Refresh
- Disconnect

Stale sessions are automatically removed.

---

## 🎬 Shared VHS / Movie Watching

Hangout Café includes synchronized shared media playback powered by WebTorrent.

Features:

- VHS-style media experience
- WebTorrent streaming
- Shared playback state
- Play / Pause sync
- Seek sync
- Late-join recovery
- Drift correction
- Host authority controls
- Automatic host transfer

Supported media:

- Local movie files
- Magnet links
- Torrent-based video playback

---

## 📼 Shared Media Queue

Rooms support a synchronized queue system.

Features:

- Queue media items
- Start queued items
- Skip media
- Auto-advance playback
- Persistent queue state
- Real-time queue synchronization

Only one item can play at a time.

---

## 🔄 Host Continuity

If the current media host leaves:

- Host authority automatically transfers
- Oldest active participant becomes host
- Playback continuity is preserved
- Queue management continues without interruption

Transaction-based ownership transfer prevents race conditions.

---

## 📝 Shared Wall

Leave notes for everyone in the room.

Features:

- Real-time synchronization
- Persistent storage
- Cross-tab updates
- Multi-user support
- Concurrent posting protection

Notes survive page refreshes and room inactivity.

---

## 🧸 Shared Table

Place ambient objects into the room.

Examples:

- Warm coffee
- Open book
- Teddy bear
- Lamp
- Polaroid

Objects:

- Synchronize in real time
- Persist across sessions
- Support concurrent placement

---

## 🌠 Ambient Activity Feed

Lightweight ephemeral room activity.

Examples:

- User entered room
- Note pinned
- Object placed
- Tape started

Features:

- Real-time propagation
- Automatic expiration
- No database growth
- Atmosphere-focused design

---

## 🧠 Persistent Room Memory System

Rooms remember what happened.

### Room History

Chronological room activity logs:

- Room creation
- Tape playback
- Host transfers
- Notes pinned
- Objects placed

History is:

- Immutable
- Real-time
- Bounded for performance

### Pinned Memories

Users can preserve meaningful room artifacts:

- Notes
- Objects
- Tapes
- Moments

Features:

- Creator ownership
- Persistent storage
- Restore actions
- Cross-session continuity

Rooms continue to feel inhabited even after everyone leaves.

---

## ♻️ Room Restoration

When a room becomes empty:

The room still remembers:

- Theme
- Current VHS tape
- Queue state
- History
- Pinned memories

When someone returns:

Everything is restored automatically.

---

# 🏗️ Architecture

Hangout Café uses a modular EventBus-driven architecture.

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
└── main.ts
```

### Design Principles

- EventBus-driven communication
- No direct module coupling
- Firestore as shared state layer
- Realtime synchronization
- Host-authoritative media control
- Persistent room continuity
- Scalable subcollection architecture

---

# 🔥 Firestore Architecture

The project uses Firestore subcollections to avoid document contention and scaling issues.

### Room Root

```text
rooms/{roomCode}
```

Stores:

- theme
- video state
- latest ambient action

---

### Notes

```text
rooms/{roomCode}/notes/{noteId}
```

---

### Objects

```text
rooms/{roomCode}/objects/{objectId}
```

---

### Presence

```text
rooms/{roomCode}/presence/{userId}
```

---

### Queue

```text
rooms/{roomCode}/queue/{queueItemId}
```

---

### History

```text
rooms/{roomCode}/history/{historyId}
```

---

### Memories

```text
rooms/{roomCode}/memories/{memoryId}
```

---

# 🔐 Security

Firestore security rules enforce:

- Authenticated writes only
- User-owned presence documents
- Immutable room history
- Creator-owned memories
- Immutable notes and objects
- Protected room state

Anonymous Firebase Authentication is supported.

---

# 🛠️ Tech Stack

### Frontend

- Vite
- TypeScript
- HTML
- CSS

### Realtime

- Firebase Auth
- Cloud Firestore

### Media

- WebTorrent
- YouTube Embed API
- Spotify Embed API

### Architecture

- EventBus
- Modular Services
- Host Authority Model
- Realtime Synchronization Layer

---

# 🚀 Development

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Run development server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

---

# 🎯 Project Vision

Hangout Café is an experiment in persistent digital third places.

A room is not simply a chat session.

It is a space that:

- remembers
- evolves
- accumulates history
- preserves memories
- survives inactivity
- welcomes people back

The goal is to create shared online environments that feel inhabited rather than merely connected.

---

# 📜 License

MIT License
