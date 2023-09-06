import {
  Application,
  Router,
  send,
  Status,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { exists } from "https://deno.land/std@0.192.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.192.0/path/mod.ts";

const LISTEN_PORT = 19192;
const STATIC_DIR = "./static";
const ROOT_PATH = "/";

const app = new Application();
const router = new Router();

interface Client {
  socket: WebSocket;
  pos: { x: number; y: number; id: string };
}

const clients: Client[] = [];

// Remove a client from the clients array
const removeClient = (client: Client) => {
  const index = clients.indexOf(client);
  if (index > -1) {
    clients.splice(index, 1);
  }
};

// Send positions of all clients to all clients
const broadcastPositions = () => {
  const positions = clients.map((client) => client.pos);
  for (const client of clients) {
    const otherPositions = positions.filter((pos) => pos.id !== client.pos.id); // Filter out own position
    client.socket.send(JSON.stringify(otherPositions));
  }
};

// Handle WebSocket Connection
const handleWebSocketConnection = (ws: WebSocket) => {
  const client: Client = {
    socket: ws,
    pos: { x: 0, y: 0, id: "undef" },
  };

  ws.onopen = () => {
    clients.push(client);
  };

  ws.onmessage = (event) => {
    const newPos = JSON.parse(event.data);
    client.pos.x = parseInt(newPos.x, 10);
    client.pos.y = parseInt(newPos.y, 10);
    client.pos.id = newPos.id.substring(0, 10); // Allow at most 10 chars
  };

  ws.onclose = () => {
    removeClient(client);
  };

  ws.onerror = () => {
    console.error("WebSocket error observed");
    removeClient(client);
  };
};

router.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
    return;
  }
  try {
    const ws = ctx.upgrade();
    handleWebSocketConnection(ws);
  } catch (err) {
    console.error("Failed to upgrade the connection", err);
    ctx.throw(500);
  }
});

router.get("/", ({ response }: { response: any }) => {
  response.redirect("/index.html");
});

app.use(router.routes())
  .use(router.allowedMethods())
  .use(async (ctx, next) => {
    if (!ctx.request.url.pathname.startsWith(ROOT_PATH)) {
      await next();
      return;
    }

    const filePath = ctx.request.url.pathname.replace(ROOT_PATH, "");

    const localFilePath = await join(
      STATIC_DIR,
      ctx.request.url.pathname.replace(ROOT_PATH, ""),
    );

    const fExists = await exists(localFilePath, {
      isFile: true,
      isReadable: true,
    });
    if (fExists) {
      await send(ctx, filePath, { root: STATIC_DIR });
    } else {
      await next();
    }
  })
  .use((ctx) => {
    // If no route has been matched
    ctx.response.status = Status.NotFound;
    ctx.response.body = "Not Found";
  });

// Start an interval for broadcasing mouse positions
const broadcastInterval = setInterval(broadcastPositions, 150);
// but dont keep the main loop running just because of this
Deno.unrefTimer(broadcastInterval);

app.listen({ port: LISTEN_PORT });

console.log("Started")