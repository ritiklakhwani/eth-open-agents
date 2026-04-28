# Agent eXchange Layer (AXL)

## What is AXL?

Agent eXchange Layer (AXL) is a peer-to-peer network node built by Gensyn.&#x20;

It offers an encrypted, decentralized communication layer for applications, allowing AI agents, ML pipelines, distributed computing, and more to exchange data directly between machines _without_ a central server.

Fundamentally, it works like this: you run the node on your machine where it handles all peer-to-peer transport, encryption, and routing. The node exposes a local HTTP bridge as an application interface, compatible with whatever you're building.&#x20;

### Features

AXL is designed to stay out of your way. It runs without root access, works behind NATs, and exposes a plain HTTP interface so any language can use it.

- **No TUN required:** Runs entirely in userspace using gVisor's network stack. No root privileges, no system-level network configuration.
- **No port forwarding needed:** Connects outbound to peers and receives data over the same encrypted tunnel, so standard nodes work behind NATs and firewalls without any extra configuration. If you're bootstrapping a new network from scratch, at least one node needs to be publicly reachable with an exposed port.&#x20;

{% hint style="info" %}
Running a public node on an existing network is also helpful since it adds to the overall robustness of the mesh.
{% endhint %}

- **Simple local interface:** Your application talks to `localhost:9002`. Any language that can make HTTP requests can use AXL.
- **End-to-end encrypted:** All traffic between nodes is encrypted at two layers: TLS for the direct peering link, and Yggdrasil's end-to-end encryption for the full path. Intermediate routing nodes cannot read your messages.
- **Application-agnostic:** The node doesn't care what you send. You could send JSON, protobuf, raw bytes, or tensors.
- **Protocol support:** AXL features built-in support for [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) and [A2A](https://github.com/google/A2A) (Agent-to-Agent) for structured request/response communication between agents.

### At a Glance

Getting two machines talking takes four steps and no infrastructure.

1. You build and run the AXL node binary on your machine.
2. The node connects to the Yggdrasil[^1] mesh network and gets a public key (your identity).
3. You share your public key with another person. They share theirs with you.
4. Your applications communicate through their local nodes. The nodes handle everything else.

It doesn't require any servers, cloud accounts, or DNS. It's just two machines (or more) running nodes that communicate directly over the mesh.

```
      Your Machine                                                  Their Machine
┌──────────────────────┐                                       ┌──────────────────────┐
│  [Your App]          │                                       │  [Their App]         │
│       ↕ HTTP         │                                       │       ↕ HTTP         │
│  [AXL node :9002]    │             ◄── mesh ──►              │  [AXL node :9002]    │
└──────────────────────┘                                       └──────────────────────┘
```

### Philosophy

AXL enforces a clean separation between the **\[1]** network layer (the node) and the **\[2]** application layer (your code). The node is a _pipe_ insofar as it moves bytes between peers, but it has no opinion about what those bytes mean.&#x20;

This separation means:

- You can build any application on top of AXL without modifying the node or worrying about transport protocols.
- Multiple applications can share the same node.
- The network handles encryption, routing, and peer discovery. Your application handles business logic.

{% hint style="info" %}
AXL is permissionless. Anyone can run a node or spin up their own private network. There are no gatekeepers.
{% endhint %}

### What You Can Build

Because AXL is just a communication layer, what you build on top is up to you.&#x20;

A few [examples](https://docs.gensyn.ai/tech/examples-and-building#built-in-examples) ship with the repo:

- **AI agent collaboration:** Agents on different machines sharing research signals over MCP
- **Distributed ML inference:** Tensor exchange between nodes using `msgpack`
- **GossipSub:** Pub/sub message propagation across the mesh
- **Convergecast:** Tree-based data aggregation using the network's spanning tree

#### Get Started

Ready to get started? Find documentation [here](https://docs.gensyn.ai/tech/agent-exchange-layer/get-started) on cloning the repo, building the node, creating an identity key, configuring it, and making sure everything works.

[^1]: we should link out to libraries that we have used

---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.gensyn.ai/tech/agent-exchange-layer.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

# Agent eXchange Layer (AXL)

## What is AXL?

Agent eXchange Layer (AXL) is a peer-to-peer network node built by Gensyn.&#x20;

It offers an encrypted, decentralized communication layer for applications, allowing AI agents, ML pipelines, distributed computing, and more to exchange data directly between machines *without* a central server.

Fundamentally, it works like this: you run the node on your machine where it handles all peer-to-peer transport, encryption, and routing. The node exposes a local HTTP bridge as an application interface, compatible with whatever you're building.&#x20;

### Features

AXL is designed to stay out of your way. It runs without root access, works behind NATs, and exposes a plain HTTP interface so any language can use it.

* **No TUN required:** Runs entirely in userspace using gVisor's network stack. No root privileges, no system-level network configuration.
* **No port forwarding needed:** Connects outbound to peers and receives data over the same encrypted tunnel, so standard nodes work behind NATs and firewalls without any extra configuration. If you're bootstrapping a new network from scratch, at least one node needs to be publicly reachable with an exposed port.&#x20;

{% hint style="info" %}
Running a public node on an existing network is also helpful since it adds to the overall robustness of the mesh.
{% endhint %}

* **Simple local interface:** Your application talks to `localhost:9002`. Any language that can make HTTP requests can use AXL.
* **End-to-end encrypted:** All traffic between nodes is encrypted at two layers: TLS for the direct peering link, and Yggdrasil's end-to-end encryption for the full path. Intermediate routing nodes cannot read your messages.
* **Application-agnostic:** The node doesn't care what you send. You could send JSON, protobuf, raw bytes, or tensors.
* **Protocol support:** AXL features built-in support for [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) and [A2A](https://github.com/google/A2A) (Agent-to-Agent) for structured request/response communication between agents.

### At a Glance

Getting two machines talking takes four steps and no infrastructure.

1. You build and run the AXL node binary on your machine.
2. The node connects to the Yggdrasil[^1] mesh network and gets a public key (your identity).
3. You share your public key with another person. They share theirs with you.
4. Your applications communicate through their local nodes. The nodes handle everything else.

It doesn't require any servers, cloud accounts, or DNS. It's just two machines (or more) running nodes that communicate directly over the mesh.

```
      Your Machine                                                  Their Machine
┌──────────────────────┐                                       ┌──────────────────────┐
│  [Your App]          │                                       │  [Their App]         │
│       ↕ HTTP         │                                       │       ↕ HTTP         │
│  [AXL node :9002]    │             ◄── mesh ──►              │  [AXL node :9002]    │
└──────────────────────┘                                       └──────────────────────┘
```

### Philosophy

AXL enforces a clean separation between the **\[1]** network layer (the node) and the **\[2]** application layer (your code). The node is a *pipe* insofar as it moves bytes between peers, but it has no opinion about what those bytes mean.&#x20;

This separation means:

* You can build any application on top of AXL without modifying the node or worrying about transport protocols.
* Multiple applications can share the same node.
* The network handles encryption, routing, and peer discovery. Your application handles business logic.

{% hint style="info" %}
AXL is permissionless. Anyone can run a node or spin up their own private network. There are no gatekeepers.
{% endhint %}

### What You Can Build

Because AXL is just a communication layer, what you build on top is up to you.&#x20;

A few [examples](https://docs.gensyn.ai/tech/examples-and-building#built-in-examples) ship with the repo:

* **AI agent collaboration:** Agents on different machines sharing research signals over MCP
* **Distributed ML inference:** Tensor exchange between nodes using `msgpack`
* **GossipSub:** Pub/sub message propagation across the mesh
* **Convergecast:** Tree-based data aggregation using the network's spanning tree

#### Get Started

Ready to get started? Find documentation [here](https://docs.gensyn.ai/tech/agent-exchange-layer/get-started) on cloning the repo, building the node, creating an identity key, configuring it, and making sure everything works.

[^1]: we should link out to libraries that we have used


---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.gensyn.ai/tech/agent-exchange-layer.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

# Agent eXchange Layer (AXL)

## What is AXL?

Agent eXchange Layer (AXL) is a peer-to-peer network node built by Gensyn.&#x20;

It offers an encrypted, decentralized communication layer for applications, allowing AI agents, ML pipelines, distributed computing, and more to exchange data directly between machines *without* a central server.

Fundamentally, it works like this: you run the node on your machine where it handles all peer-to-peer transport, encryption, and routing. The node exposes a local HTTP bridge as an application interface, compatible with whatever you're building.&#x20;

### Features

AXL is designed to stay out of your way. It runs without root access, works behind NATs, and exposes a plain HTTP interface so any language can use it.

* **No TUN required:** Runs entirely in userspace using gVisor's network stack. No root privileges, no system-level network configuration.
* **No port forwarding needed:** Connects outbound to peers and receives data over the same encrypted tunnel, so standard nodes work behind NATs and firewalls without any extra configuration. If you're bootstrapping a new network from scratch, at least one node needs to be publicly reachable with an exposed port.&#x20;

{% hint style="info" %}
Running a public node on an existing network is also helpful since it adds to the overall robustness of the mesh.
{% endhint %}

* **Simple local interface:** Your application talks to `localhost:9002`. Any language that can make HTTP requests can use AXL.
* **End-to-end encrypted:** All traffic between nodes is encrypted at two layers: TLS for the direct peering link, and Yggdrasil's end-to-end encryption for the full path. Intermediate routing nodes cannot read your messages.
* **Application-agnostic:** The node doesn't care what you send. You could send JSON, protobuf, raw bytes, or tensors.
* **Protocol support:** AXL features built-in support for [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) and [A2A](https://github.com/google/A2A) (Agent-to-Agent) for structured request/response communication between agents.

### At a Glance

Getting two machines talking takes four steps and no infrastructure.

1. You build and run the AXL node binary on your machine.
2. The node connects to the Yggdrasil[^1] mesh network and gets a public key (your identity).
3. You share your public key with another person. They share theirs with you.
4. Your applications communicate through their local nodes. The nodes handle everything else.

It doesn't require any servers, cloud accounts, or DNS. It's just two machines (or more) running nodes that communicate directly over the mesh.

```
      Your Machine                                                  Their Machine
┌──────────────────────┐                                       ┌──────────────────────┐
│  [Your App]          │                                       │  [Their App]         │
│       ↕ HTTP         │                                       │       ↕ HTTP         │
│  [AXL node :9002]    │             ◄── mesh ──►              │  [AXL node :9002]    │
└──────────────────────┘                                       └──────────────────────┘
```

### Philosophy

AXL enforces a clean separation between the **\[1]** network layer (the node) and the **\[2]** application layer (your code). The node is a *pipe* insofar as it moves bytes between peers, but it has no opinion about what those bytes mean.&#x20;

This separation means:

* You can build any application on top of AXL without modifying the node or worrying about transport protocols.
* Multiple applications can share the same node.
* The network handles encryption, routing, and peer discovery. Your application handles business logic.

{% hint style="info" %}
AXL is permissionless. Anyone can run a node or spin up their own private network. There are no gatekeepers.
{% endhint %}

### What You Can Build

Because AXL is just a communication layer, what you build on top is up to you.&#x20;

A few [examples](https://docs.gensyn.ai/tech/examples-and-building#built-in-examples) ship with the repo:

* **AI agent collaboration:** Agents on different machines sharing research signals over MCP
* **Distributed ML inference:** Tensor exchange between nodes using `msgpack`
* **GossipSub:** Pub/sub message propagation across the mesh
* **Convergecast:** Tree-based data aggregation using the network's spanning tree

#### Get Started

Ready to get started? Find documentation [here](https://docs.gensyn.ai/tech/agent-exchange-layer/get-started) on cloning the repo, building the node, creating an identity key, configuring it, and making sure everything works.

[^1]: we should link out to libraries that we have used


---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.gensyn.ai/tech/agent-exchange-layer.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

# How it Works

## The Mental Model

This is the single most important thing to understand about AXL, and it's counterintuitive if you're coming from traditional client-server architecture:

*Your application code never touches the network.*&#x20;

It runs on your machine and only ever talks to `http://127.0.0.1:9002` which is the local HTTP interface exposed by your AXL node. Your node handles all peer-to-peer transport, encryption, and routing behind the scenes.

Both sides run the full stack independently. If two people want to communicate, each person runs:

1. Their own AXL node (the `Go` binary)
2. Their own copy of the application

Nobody "connects to" the other person's application. Each application talks only to its own local node. The nodes talk to each other over the encrypted mesh.

```
      Your Machine                                                  Their Machine
┌──────────────────────┐                                       ┌──────────────────────┐
│  [Your App]          │                                       │  [Their App]         │
│       ↕ HTTP         │                                       │       ↕ HTTP         │
│  [AXL node :9002]    │             ◄── mesh ──►              │  [AXL node :9002]    │
└──────────────────────┘                                       └──────────────────────┘
```

"Exposing a service" doesn't mean what it usually means. In traditional web development, exposing a service means binding to a port and accepting remote connections. But in AXL, it means: **\[1]** your node is running, **\[2]** your application is running locally, and **\[3]** remote nodes send messages to your public key.&#x20;

The Yggdrasil network routes those messages to your node, which queues them for your application. Your application is never directly reachable from the outside. The node is the *only thing* with a network presence.

Therefore, there is nothing to deploy; you run your application on your laptop, and as long as your node is up, other nodes can reach you by your public key, so long as you share it.

### Architecture

The Go binary (`node`) contains four layers:

```
                        localhost
                 ┌──────────────────┐
                 │                  │
    Your App ◄───┤ HTTP API (:9002) │
                 │                  │
                 │   Multiplexer   ─┼──► MCP Router (:9003)
                 │        │         │
                 │   gVisor TCP     ├──► A2A Server (:9004)
                 │        │         │
                 │   Yggdrasil Core │
                 │        │         │
                 └────────┼─────────┘
                          │ TLS/TCP
                          ▼
                     Network Peers
```

| **Layer**        | **What It Does**                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| *HTTP Interface* | Local server on `127.0.0.1:9002`. Your application's single point of contact with the node.                                      |
| *Multiplexer*    | Routes inbound TCP messages to the correct handler based on envelope fields. Unmatched messages go to a queue your app can read. |
| *gVisor TCP*     | Userspace TCP/IP stack. No TUN device, no root privileges. Listens on port 7000 for inbound peer connections.                    |
| *Yggdrasil Core* | Manages the ed25519 keypair, derives a deterministic IPv6 address, and peers over TLS/TCP with other nodes.                      |

The MCP Router and A2A Server are optional, separate Python processes for structured request/response protocols. See [Building Applications & Examples](https://docs.gensyn.ai/tech/agent-exchange-layer/examples-and-building) for details.

#### Startup Flow

Here is what happens when you run `./node -config node-config.json`:

1. CLI flags are parsed (`-config`, optional `-listen` override).
2. The config file is read for both Yggdrasil settings (`Peers`, `Listen`, `PrivateKeyPath`) and node settings (ports, limits, router URLs).
   1. Yggdrasil core starts. It connects to configured peers, joins the spanning tree, logs your IPv6 address and public key.
   2. gVisor TCP stack starts and listens on `tcp_port` (default 7000) for inbound connections from other nodes.
   3. HTTP server starts then binds to `bridge_addr:api_port` (default `127.0.0.1:9002`).

### The Yggdrasil Network

AXL uses [Yggdrasil](https://yggdrasil-network.github.io/), an encrypted IPv6 overlay network, for all peer-to-peer transport.

* **Overlay network.** Yggdrasil runs on top of the regular internet (or LAN). It creates an encrypted mesh between all participating nodes.
* **Spanning tree routing.** Peers form a spanning tree. Each node gets a deterministic IPv6 address derived from its public key. Routing happens along the tree without no centralized routing table.
* **Identity = public key.** Nodes are identified by their 64-character hex-encoded `ed25519` public key, not by IP or hostname.
* **Encrypted by default.** All connections use TLS, and Yggdrasil adds end-to-end encryption on top (see Encryption below).

### Peering

To join the network, your node connects to at least one other node. This is configured in the `Peers` array in `node-config.json`.

#### Bootstrap Peers

Bootstrap peers are nodes that accept inbound connections and help route traffic. They're entry points into the mesh, not controllers and as such they cannot read your message content. They just relay encrypted bytes.

```json
{
  "Peers": ["tls://1.2.3.4:9001"]
}
```

Once connected to a bootstrap peer, your node can reach any other node in the mesh by their public key. The mesh handles all of the routing work so you don't need direct connectivity to every node.

{% hint style="success" %}
Bootstrap peers are a standard pattern used by Bitcoin, IPFS, Ethereum, and other P2P networks. Anyone can run one.
{% endhint %}

#### Running a Public Node (Being a Bootstrap Peer)

If you want other nodes to connect to you, you can run a public node. Public nodes help route traffic through the mesh: they don't store other nodes' data or have access to their messages, they just forward encrypted bytes.&#x20;

The more public nodes in the network, the more resilient it becomes.&#x20;

To set one up:

1. Expose a TCP port to the network (LAN or internet).
2. Add a `Listen` address to your config:

```json
 {
   "PrivateKeyPath": "private.pem",
   "Listen": ["tls://0.0.0.0:9001"]
 }
```

3. Share your IP and port with others. They add `tls://YOUR_IP:9001` to their `Peers`.

Use a persistent identity (`PrivateKeyPath`) so your key doesn't change across restarts.&#x20;

{% hint style="info" %}
Keep the HTTP interface port (`9002`) locked to localhost. Only the peering port should be exposed.
{% endhint %}

#### LAN vs. Internet Peering

* **On a LAN (same network):** Trivial. Both nodes just need each other's LAN IP and listen port. There is no port forwarding or firewall adjustments that need to be made with this route.
* **Over the internet:** The listening node must expose its TCP port to the public internet (port forwarding, cloud VM with open port, etc.). Outbound-only nodes don't need to expose anything however: they can still communicate with each other because traffic is routed through public nodes in the mesh.

#### Peer Discovery

Running the following command returns:

* `our_public_key`: your node's identity
* `our_ipv6`: your node's Yggdrasil IPv6 address
* `peers`: directly connected peers
* `tree`: the spanning tree as your node sees it

```bash
curl -s http://127.0.0.1:9002/topology | python3 -m json.tool
```

{% hint style="info" %}
There is no built-in service registry.&#x20;

You can see public keys in the tree, but you can't look up who owns them or what services they run. Keys and service names must be exchanged directly between people.&#x20;
{% endhint %}

### Encryption: Two Layers

There are two distinct layers of encryption. Understanding both matters.

#### Layer 1: Peering Transport (TLS)

The `tls://` URIs in your config establish encrypted links between directly connected peers. This is hop-by-hop meaning it secures the connection between your node and the peer it's directly connected to, which is standard TLS.

#### Layer 2: End-to-End Payload Encryption (Yggdrasil)

Separately, Yggdrasil encrypts all traffic between source and destination using keys derived from both nodes' ed25519 keypairs. This is end-to-end so if *Node A* sends a message to *Node C* and it routes through *Node B*, *Node B* sees only ciphertext it cannot decrypt.&#x20;

```
Node A ──[TLS]──► Bootstrap Node ──[TLS]──► Node B
         Layer 1                   Layer 1

Node A ═══════════[E2E Encrypted]═══════════► Node B
                    Layer 2
                 (bootstrap can't read this)
```

Both of these matter because in a mesh network, your traffic may pass through nodes you don't control. *Layer 1* protects the link whereas *Layer 2* protects the payload across the entire path, regardless of how many hops it takes.

{% hint style="info" %}
So even though a different node could 'see' that there is communication happening, it can't figure out what is being communicated.&#x20;
{% endhint %}

### Security & Privacy

What routing nodes can and cannot see is important to understanding security and privacy of anything connected to a node, coming from a node, being received *by* a node, etc.&#x20;

#### What Nodes Can & Cannot See

* Routing nodes *can* see:
  * That your node exists and your IP address (you connected to them directly).
  * That two nodes are communicating, including the **\[1]** source and **\[2]** destination public keys.
  * When communication happens, how frequently, and the approximate message sizes.&#x20;
* Routing nodes *cannot* see:
  * Message content. They route encrypted bytes with no ability to decrypt.
  * **\[1]** What your application does, **\[2]** what services you expose, or **\[3]** what commands are being sent.
  * Anything inside the encrypted payload: application-level metadata like JSON fields, headers, or protocol details.

{% hint style="info" %}
'Routing nodes' also includes *bootstrap peers.*&#x20;
{% endhint %}

***

| **Information**            | **Sender** | **Receiver** | **Routing Nodes**       |
| -------------------------- | ---------- | ------------ | ----------------------- |
| *Message content*          | Yes        | Yes          | No                      |
| *Application metadata*     | Yes        | Yes          | No                      |
| *Who is communicating*     | Yes        | Yes          | Yes (public keys)       |
| *When and how often*       | Yes        | Yes          | Yes                     |
| *Approximate message size* | Yes        | Yes          | Yes                     |
| *Your IP address*          | —          | —            | Yes (direct peers only) |

***

#### Limitations

Yggdrasil, unlike Tor, does not use onion routing, meaning there is no traffic obfuscation. Although it protects the content of conversations, anyone who controls the routing nodes can observe the communication patterns, specifically who communicates with whom and when, but they cannot see the actual content of this communication.&#x20;

Additionally, your Internet Protocol (IP) address is visible to direct connections. This visibility extends to bootstrap peers and any node you directly connect with, making your real IP address accessible to them.

{% hint style="warning" %}
Security considerations are important when using Yggdrasil. While it employs standard cryptographic methods, such as `ed25519`, TLS 1.3, and the Noise protocol, it has not undergone a formal, independent security audit. Thus, additional caution is advised.&#x20;
{% endhint %}

In the event of a key compromise, the consequences are total. If this happens, anyone with access to your `private.pem` file can impersonate your node. Due to this risk, you *must* private key with the same vigilance as an SSH key.&#x20;

Moreover, Yggdrasil does not include access control mechanisms. Any node possessing your public key can send messages to you, so it is crucial that your application *independently validate message senders* when necessary.

### Data Flow

This section describes the flow of data during sending and receiving messages within an AXL-powered application.

#### Sending a Message

Your application posts data to `localhost:9002/send` with the destination peer's public key.&#x20;

The node dials the remote peer over the gVisor TCP stack, writes a length-prefixed message, and returns: there is response from the remote destination.

#### Receiving a Message

When a remote peer sends your node a message, the multiplexer checks it against registered protocol streams (MCP, A2A). If nothing matches, it goes into an in-memory queue which your application then polls.

#### MCP / A2A (Request-Response)

For structured communication, the node:

1. wraps your JSON-RPC body in a transport envelope
2. sends it to the remote peer
3. waits for a response (30-second timeout)
4. unwraps it, then returns it.&#x20;

The remote peer must have the corresponding service running.

### Wire Format

All TCP messages between nodes are length-prefixed: a 4-byte big-endian `uint32` length followed by a payload of XYZ number of bytes.

```
┌──────────────┬─────────────────────────────────┐
│ Length (4B)   │ Payload (Length bytes)           │
│ big-endian   │                                  │
│ uint32       │                                  │
└──────────────┴─────────────────────────────────┘
```

{% hint style="info" %}
Max message size defaults to 16 MB which is configurable via `max_message_size`.
{% endhint %}

#### Envelope Routing

The multiplexer determines how to handle each inbound message by inspecting its content:

| **Envelope Pattern**                   | **Routed To**                              |
| -------------------------------------- | ------------------------------------------ |
| `{"service": "...", "request": {...}}` | MCP Router                                 |
| `{"a2a": true, "request": {...}}`      | A2A Server                                 |
| *Anything else*                        | Message queue (your app reads via polling) |

The first protocol stream whose discriminator matches 'wins' and any unmatched messages go to the queue.

### Internals

Here you can find a breakdown of the AXL repo and some additional information on the dependencies it requires.&#x20;

***

#### Project Layout

```
cmd/node/              # Go entrypoint — main.go (wiring), config.go (settings)
api/                   # HTTP handlers — send, recv, topology, mcp, a2a
internal/
  tcp/listen/          # Inbound TCP: listener, multiplexer, stream interface
  tcp/dial/            # Outbound TCP: peer dialing
  mcp/                 # MCP stream (envelope parsing, forwarding to router)
  a2a/                 # A2A stream (envelope parsing, forwarding to server)
integrations/          # Python services: MCP router, A2A server
examples/              # Python examples: tensors, gossipsub, convergecast, A2A
```

***

#### gVisor TCP Stack

AXL uses [gVisor's](https://gvisor.dev/) userspace network stack instead of the OS kernel's TCP/IP.&#x20;

For this, there is/are:

* **No TUN device:** No virtual network interface are created.
* **No root privileges:** Everything runs in userspace.
* **No system configuration:** No `sysctl` and no routing table changes.

The stack bridges to Yggdrasil's core, providing standard TCP operations (**\[1]** listen, **\[2]** accept, **\[3]** dial) over the encrypted mesh.

* **Inbound:** A TCP listener on `tcp_port` (default 7000) accepts connections from remote nodes. Each connection delivers a length-prefixed message routed by the multiplexer.
* **Outbound:** `DialPeerConnection` converts a 64-char hex public key to a Yggdrasil IPv6 address and dials it through the gVisor stack.

#### The Stream Interface

The multiplexer routes messages using a `Stream` interface:

```go
type Stream interface {
    GetID() string
    IsAllowed(data []byte, metadata any) bool
    Forward(metadata any, fromPeerId string) ([]byte, error)
}
```

* `IsAllowed` inspects raw bytes and returns `true` if this stream handles the message.
* `Forward` processes the message and returns a response.

{% hint style="info" %}
Streams are checked in order, where the first match wins. If there is no match it is sent to the message queue.
{% endhint %}

MCP and A2A are implemented as streams. To add a new protocol, implement `Stream` and register it in `internal/tcp/listen/listener.go`.

#### Connection Limits

There are some default connection limits (as shown below) but these values can be adjusted. See the [Configuration](https://docs.gensyn.ai/tech/agent-exchange-layer/configuration) page for more information.

| **Setting**              | **Default** | **Description**                          |
| ------------------------ | ----------- | ---------------------------------------- |
| `max_concurrent_conns`   | 128         | Max simultaneous inbound TCP connections |
| `conn_read_timeout_secs` | 60          | Read timeout per connection              |
| `conn_idle_timeout_secs` | 300         | Idle timeout per connection              |

#### Message Queue

Inbound messages that don't match any stream go to an in-memory queue:

* **Unbounded:** Messages accumulate until read.
* **Single-consumer:** Each read dequeues one message. If you need multiple consumers, you'll need to build a fan-out layer that polls `/recv` and distributes to your consumers.
* **Non-persistent:** The queue empties on restart.
* **First-in, First Out (FIFO):** Messages are returned in the order they arrived.

#### Dependencies

These are the dependencies required by AXL.&#x20;

| **Dependency**                                                    | **Purpose**            |
| ----------------------------------------------------------------- | ---------------------- |
| [yggdrasil-go](https://github.com/yggdrasil-network/yggdrasil-go) | Mesh networking core   |
| [gVisor](https://gvisor.dev/)                                     | Userspace TCP/IP stack |
| [gologme/log](https://github.com/gologme/log)                     | Structured logging     |

{% hint style="warning" %}
Go module requires `Go 1.25.x` (gVisor has build tag issues with `1.26`). See [Get Started](https://docs.gensyn.ai/tech/agent-exchange-layer/get-started) for more info.
{% endhint %}

#### Running Tests

The repo includes Go tests for the core node (API handlers, TCP transport and protocol streams) and Python tests for the MCP router and A2A server integrations. You don't need any external services.&#x20;

```bash
# Go
go test ./...

# Python integrations
cd integrations
pip install -e ".[test]"
pytest
```


---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.gensyn.ai/tech/agent-exchange-layer/how-it-works.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

# Building Applications & Examples

## Overview

AXL is a peer-to-peer networking layer that lets you build distributed applications over a mesh of connected nodes.&#x20;

{% hint style="info" %}
For more on the internals of AXL, check out [How it Works.](https://docs.gensyn.ai/tech/agent-exchange-layer/how-it-works)
{% endhint %}

It provides low-level messaging primitives along with higher-level protocol support for MCP and A2A, so you can go from simple fire-and-forget communication to fully discoverable agent services with minimal setup.

### Building your Own Application

Building an application using AXL means picking a starting point. In this case, that starting point can be a *building pattern* which makes use of AXL's low-level functionalities in a particular way.&#x20;

These patterns include **\[1]** fire-and-forget (using `send`/`recv`), **\[2]** MCP services (`request`/`response`), and **\[3]** A2A (agent-to-agent).&#x20;

### Pattern 1: Send/Recv (Fire-and-Forget)

This is the simplest pattern. Your application sends raw bytes and polls for incoming messages.

```python
import requests, json, time

AXL = "http://127.0.0.1:9002"
PEER = "1ee862344fb283395143ac9775150d2e5936efd6e78ed0db83e3f290d3d539ef"

def send(message):
    requests.post(f"{AXL}/send",
        headers={"X-Destination-Peer-Id": PEER},
        data=json.dumps(message))

def recv_loop():
    while True:
        resp = requests.get(f"{AXL}/recv")
        if resp.status_code == 200:
            sender = resp.headers.get("X-From-Peer-Id")
            print(f"From {sender[:8]}...: {resp.text}")
        time.sleep(0.2)
```

* **When to use:** Simple messaging, notifications, data streaming, custom protocols where you control both sides.
* **Limitation:** No built-in acknowledgment. If you need request-response, use MCP/A2A or build correlation over `send`/`recv`.

### Pattern 2: MCP Services (Request-Response)

MCP (Model Context Protocol) gives you structured JSON-RPC request-response. You expose a named service on your node, and other nodes call it remotely.

The requests flow like this:

```
Remote node calls POST /mcp/{your_key}/sentiment
  -> Your node receives it
  -> Multiplexer sees "service" field → forwards to MCP Router (localhost:9003)
  -> Router dispatches to your service (localhost:7100)
  -> Your service processes and responds
  -> Response flows back to remote node
```

#### Step 1: Write Your Service

You can start by configuring a basic HTTP server:

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/mcp", methods=["POST"])
def handle():
    req = request.json
    if req.get("method") == "tools/list":
        return jsonify({
            "jsonrpc": "2.0", "id": req["id"],
            "result": {"tools": [{"name": "analyze", "description": "Analyze sentiment"}]}
        })
    if req.get("method") == "tools/call":
        result = do_analysis(req["params"].get("arguments", {}))
        return jsonify({
            "jsonrpc": "2.0", "id": req["id"],
            "result": {"content": [{"type": "text", "text": json.dumps(result)}]}
        })
    return jsonify({"error": "unknown method"}), 400

app.run(host="127.0.0.1", port=7100)
```

#### Step 2: Start the MCP Router

```bash
cd integrations
pip install -e .
python -m mcp_routing.mcp_router --port 9003
```

#### Step 3: Register your Service w/ Router

```python
requests.post("http://127.0.0.1:9003/register", json={
    "service": "sentiment",
    "endpoint": "http://127.0.0.1:7100/mcp"
})
```

Don't forget to deregister on shutdown using this command:

`requests.delete("http://127.0.0.1:9003/register/sentiment")`

#### Step 4: Enable MCP (Node Config)

If you run this command, any node on the network can call your service by your public key and service name:

```json
{
  "router_addr": "http://127.0.0.1",
  "router_port": 9003
}
```

If you want to calling a remote MCP service (from another node), you'd run this:

```bash
# List tools on a remote peer's "sentiment" service
curl -X POST http://127.0.0.1:9002/mcp/{peer_id}/sentiment \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'

# Call a specific tool
curl -X POST http://127.0.0.1:9002/mcp/{peer_id}/sentiment \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"analyze","arguments":{"market":"0x3f"}}}'
```

{% hint style="info" %}
Replace `{peer_id}` with the remote node's 64-character hex public key.&#x20;

Both nodes must share at least one common peer but they don't need direct connectivity.
{% endhint %}

#### **MCP Router Endpoints**

Use this list of router endpoints.

| **Endpoint**                 | **Description**                                                |
| ---------------------------- | -------------------------------------------------------------- |
| `POST /route`                | Forward a request to a registered service (called by the node) |
| `POST /register`             | Register a service: `{"service": "...", "endpoint": "..."}`    |
| `DELETE /register/{service}` | Remove a service                                               |
| `GET /services`              | List registered services                                       |
| `GET /health`                | Health check                                                   |

### Pattern 3: A2A (Agent-to-Agent)

A2A wraps your MCP services as [A2A skills](https://github.com/google/A2A), making them discoverable by A2A-compatible agents.

Run this command:

```bash
python -m a2a_serving.a2a_server --port 9004 --router http://127.0.0.1:9003
```

Then add it to your node configuration file:

```json
{
  "a2a_addr": "http://127.0.0.1",
  "a2a_port": 9004
}
```

The A2A server auto-discovers services from the MCP router and advertises them at `/.well-known/agent.json`.&#x20;

Remote nodes can interact with your A2A server like this:

```bash
# Fetch the remote peer's agent card (discover available skills)
curl http://127.0.0.1:9002/a2a/{peer_id}

# Send an A2A request
curl -X POST http://127.0.0.1:9002/a2a/{peer_id} \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": 1,
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "{\"service\":\"sentiment\",\"request\":{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1,\"params\":{}}}"}],
        "messageId": "msg-001"
      }
    }
  }'
```

The `messageId` is a client-assigned correlation ID. The text part must be a JSON-stringified MCP request matching the format the A2A server expects.

#### A2A Test Client

&#x20;A convenience script is included at `examples/python-client/a2a_client.py`:

```bash
# Local mode (talk to your own A2A server)
python examples/python-client/a2a_client.py --service sentiment --method tools/list

# Remote mode (route through the mesh to a remote peer)
python examples/python-client/a2a_client.py \
  --remote --peer-id {peer_id} \
  --service sentiment --method tools/list
```

### Adding a Custom Protocol

If MCP and A2A don't fit your needs, you can add your own protocol by implementing the `Stream` interface:

```go
type MyStream struct{}

func (s *MyStream) GetID() string { return "my-protocol" }

func (s *MyStream) IsAllowed(data []byte, metadata any) bool {
    var envelope map[string]interface{}
    if err := json.Unmarshal(data, &envelope); err != nil {
        return false
    }
    _, ok := envelope["my_protocol"]
    return ok
}

func (s *MyStream) Forward(metadata any, fromPeerId string) ([]byte, error) {
    // Process the message, return a response
    return responseBytes, nil
}
```

Register it in `internal/tcp/listen/listener.go` alongside the MCP and A2A streams. Messages matching your discriminator will be routed to your handler instead of the default queue.

### Sharing Your Service

Once running, other nodes need two things: **\[1]** your public key (so other nodes can find and connect to yours) and **\[2]** your service name, so they know what to call.&#x20;

You can share your public key and service name however you like.&#x20;

> *e.g., "I'm `37227e...` and I run a `sentiment` MCP service."*

### Built-in Examples

There are several example applications that are built into the AXL repository itself, each demonstrating an angle of the technology. You can find them here.

#### 1. Tensor Exchange

Send and receive PyTorch tensors between nodes using msgpack serialization.

> **File:** `examples/python-client/client.py`

**Modes:**

* `recv`: listen for incoming tensors
* `tensor`: send a tensor to a peer
* `bandwidth`: bandwidth test

```bash
pip3 install -r examples/python-client/requirements.txt

# On the receiving node
python3 examples/python-client/client.py recv --port 9002

# On the sending node
python3 examples/python-client/client.py tensor --port 9012 --peer <PEER_KEY>
```

#### 2. Remote MCP Server

Connect two nodes so one can call MCP tools hosted on the other. A2A is not required. The node's `/mcp/` endpoint talks directly to a remote peer's MCP router.

1. **Remote Machine (Sender)**

```bash
./node -config node-config.json

# Start the MCP router
python -m mcp_routing.mcp_router

# Start your MCP service(s) and register them with the router
```

2. **Local Machine (Receiver)**

```bash
./node -config node-config.json

# List tools on the remote peer's "weather" service
curl -X POST http://127.0.0.1:9002/mcp/<remote-public-key>/weather \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1,"params":{}}'
```

Both nodes must be able to reach at least one common peer (configured in `Peers`). They don't need direct connectivity.

#### 3. Remote A2A

Optimize integration by transforming MCP services into A2A skills using the optional A2A extension.&#x20;

1. **Remote Machine (Sender):**

```bash
python -m a2a_serving.a2a_server
```

2. **Local Machine (Receiver):**

```bash
python examples/python-client/a2a_client.py \
  --remote --peer-id <remote-public-key> \
  --service weather --method tools/list
```

The A2A server automatically detects and registers MCP services as skills, making access easy for agents that are already A2A-compatible.

#### 4. GossipSub

GossipSub-style pub/sub message propagation with IHAVE/IWANT lazy forwarding, built on `send`/`recv`.

> **File:** `examples/python-client/gossipsub/gossipsub.py`

#### 5. Convergecast

Tree-based data aggregation using the network's spanning tree. Nodes derive their position from `/topology` and aggregate results upward toward the root.

> **File:** `examples/python-client/convergecast.py`


---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.gensyn.ai/tech/agent-exchange-layer/examples-and-building.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

