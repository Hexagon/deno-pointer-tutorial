// Imports
import {
  Application,
  Router,
  send,
  Status,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { exists } from "https://deno.land/std@0.192.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.192.0/path/mod.ts";

// Constants
const LISTEN_PORT = 19192;
const STATIC_DIR = "./static";
const ROOT_PATH = "/";
const BROADCAST_INTERVAL = 150; // milliseconds

// Initialize Oak Application and Router
const app = new Application();
const router = new Router();

// Define Client Interface
interface Client {
  socket: WebSocket;
  pos: { x: number; y: number; id: string };
}

// Active clients list
const clients: Client[] = [];

// Helper Functions
const removeClient = (client: Client) => {
  const index = clients.indexOf(client);
  if (index > -1) {
    clients.splice(index, 1);
  }
};

const broadcastPositions = () => {
  const positions = clients.map((client) => client.pos);
  clients.forEach((client) => {
    const filteredPositions = positions.filter((pos) =>
      pos.id !== client.pos.id
    );
    client.socket.send(JSON.stringify(filteredPositions));
  });
};

const handleWebSocketConnection = (ws: WebSocket) => {
  const client: Client = { socket: ws, pos: { x: 0, y: 0, id: "undef" } };

  ws.onopen = () => clients.push(client);
  ws.onmessage = (event) => {
    const { x, y, id } = JSON.parse(event.data);
    client.pos = {
      x: parseInt(x, 10),
      y: parseInt(y, 10),
      id: id.substring(0, 10),
    };
  };
  ws.onclose = () => removeClient(client);
  ws.onerror = () => {
    console.error("WebSocket error observed");
    removeClient(client);
  };
};

// Routing
router.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
    return;
  }
  const ws = ctx.upgrade();
  handleWebSocketConnection(ws);
});

router.get("/", ({ response }) => {
  response.redirect("/index.html");
});

// Middleware
app.use(router.routes())
  .use(router.allowedMethods())
  .use(async (ctx, next) => {
    const filePath = ctx.request.url.pathname.replace(ROOT_PATH, "");
    const localFilePath = await join(STATIC_DIR, filePath);

    if (await exists(localFilePath)) {
      await send(ctx, filePath, { root: STATIC_DIR });
    } else {
      await next();
    }
  })
  .use((ctx) => {
    ctx.response.status = Status.NotFound;
    ctx.response.body = "Not Found";
  });

// Run Server
const broadcastInterval = setInterval(broadcastPositions, BROADCAST_INTERVAL);
Deno.unrefTimer(broadcastInterval);

app.listen({ port: LISTEN_PORT });
console.log(`Server started at http://localhost:${LISTEN_PORT}`);
console.log(
  `Visit http://localhost:${LISTEN_PORT}/index.html for the main page.`,
);
console.log(`WebSocket endpoint is ws://localhost:${LISTEN_PORT}/ws`);
