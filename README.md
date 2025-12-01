# @shane32/graphql

A TypeScript-first GraphQL client for React applications with built-in caching, subscriptions, and testing utilities.

[![NPM Version](https://img.shields.io/npm/v/%40shane32%2Fgraphql)](https://www.npmjs.com/package/@shane32/graphql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- 🚀 **Multiple GraphQL endpoints** - Support for multiple clients/endpoints
- 💾 **Smart caching** - Configurable caching strategies for queries
- 🔄 **Real-time subscriptions** - WebSocket support with [graphql-ws](https://github.com/enisdenjo/graphql-ws) protocol
- 🧪 **Testing utilities** - Built-in test client for easy mocking
- 📝 **TypeScript first** - Full TypeScript support with type safety
- ⚛️ **React hooks** - `useQuery` and `useMutation` hooks for seamless React integration
- 🔧 **Flexible configuration** - Customizable request transformation and error handling

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Advanced Configuration](#advanced-configuration)
- [Usage](#usage)
- [Subscription Timeout Strategies](#subscription-timeout-strategies)
- [Subscription Reconnection Strategies](#subscription-reconnection-strategies)
- [API Reference](#api-reference)
- [Testing](#testing)
- [GraphQL Codegen Support](#graphql-codegen-support)
- [Creating Request Objects](#creating-request-objects)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)

## Installation

```bash
# npm
npm install @shane32/graphql

# yarn
yarn add @shane32/graphql

# pnpm
pnpm add @shane32/graphql
```

### Peer Dependencies

This package requires the following peer dependencies:

- `react` >= 16
- `react-dom` >= 16
- `graphql` >= 16 (optional, only needed for testing via `GraphQLTestClient`)

### Requirements

This package uses the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) and will require a polyfill for older browsers. When running in a test environment, you will need to provide a mock implementation of the Fetch API.

## Quick Start

```tsx
import React from 'react';
import { GraphQLClient, GraphQLContext, useQuery, IdleTimeoutStrategy } from '@shane32/graphql';

// 1. Create a client
const client = new GraphQLClient({
  url: 'https://api.example.com/graphql'
});

// 2. Provide context to your app
function App() {
  return (
    <GraphQLContext.Provider value={{ client }}>
      <UserProfile userId="123" />
    </GraphQLContext.Provider>
  );
}

// 3. Use hooks in components
function UserProfile({ userId }: { userId: string }) {
  const { data, error, loading } = useQuery<{ user: { name: string; email: string } }>(
    `query GetUser($id: ID!) {
       user(id: $id) { name email }
     }`,
    { variables: { id: userId } }
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      <h1>{data.user.name}</h1>
      <p>{data.user.email}</p>
    </div>
  );
}
```

## Advanced Configuration

1. Set up a client in your index.tsx page

```javascript
const client = new GraphQLClient({
    url: 'https://localhost/graphql',         // required; url of GraphQL endpoint
    webSocketUrl: 'wss://localhost/graphql',  // optional; url of GraphQL WebSocket endpoint
    isForm: true,                             // optional; whether to use form data for POST requests instead of JSON

    defaultFetchPolicy: 'cache-first',        // optional; default is cache-first; other options are no-cache and cache-and-network
    defaultCacheTime: 24 * 60 * 60 * 1000,    // optional; specified in milliseconds; default is 1 day
    maxCacheSize: 20 * 1024 * 1024,           // optional; specified in bytes; default is 20MB

    validateResponseContentType: true,        // optional; validate response content type; default is false

    // optional; transformation of Request; used to provide authentication information to request
    transformRequest: request => Promise.resolve(request),

    // optional; provides payload for WebSocket connection initialization messages; used to provide authentication information to request
    generatePayload: () => Promise.resolve({}),

    // optional; default options for subscriptions
    defaultSubscriptionOptions: {
        timeoutStrategy: new IdleTimeoutStrategy(30000)  // abort subscription if no messages received for 30 seconds
    },

    // optional; callback for logging non-2xx HTTP status codes
    logHttpError: (request, response) => {
        console.error(`GraphQL request failed with status ${response.status} ${response.statusText}`);
        response.text().then(body => console.error(`Response body: ${body}`));
    },

    // optional; callback for logging WebSocket connection failures
    logWebSocketConnectionError: (request, connectionMessage, receivedMessage) => {
        console.error(`WebSocket connection failed`, {
            request,
            connectionMessage,
            receivedMessage
        });
    }
});
```

2. Set up context for hooks

```typescript
const context: IGraphQLContext = {
    client: client,                     // required: default client
    guest: guestClient,                 // optional: guest client
    "alt": altClient                    // optional: any other clients
};
```

3. Provide context to application

```tsx
<GraphQLContext.Provider value={context}>
    ...
</GraphQLContext.Provider>
```

## Usage

It is simplest to set up your query and types first.

```typescript
const productQuery = 'query($id: ID!) { product(id: $id) { name price } }';

interface ProductQueryResult {
    product: { name: string, price: number } | null;
}

interface ProductQueryVariables {
    id: string
}

const updateProductPriceMutation = 'mutation($id: ID!, $price: Float!) { updateProductPrice(id: $id, price: $price) { name price } }';

interface ProductPriceMutationResult {
    updateProductPrice: { name: string, price: number } | null;
}

interface ProductPriceMutationVariables {
    id: string;
    price: number;
}

const priceUpdateSubscription = 'subscription($id: ID!) { priceUpdate(id: $id) { price } }';

interface ProductPriceSubscriptionResult {
    priceUpdate: { price: number };
}

interface ProductPriceSubscriptionVariables {
    id: string;
}
```

Then you can use the client directly, or use one of the hooks.

### Direct use - query/mutation/subscription

```typescript
// pull from context, if applicable
const client = React.useContext(GraphQLContext).client;

// execute a query or mutation
const result = await client.executeQueryRaw<ProductQueryResult, ProductQueryVariables>({ query: productQuery, variables: { id: productId } }).result;

// execute a subscription
const { connected, abort } = client.executeSubscription<ProductPriceSubscriptionResult, ProductPriceSubscriptionVariables>(
    { query: priceUpdateSubscription, variables: { id: productId } },
    (data) => { /* process data or errors sent from the server */ },
    (reason) => { /* subscription closed */ }
);
```

### useQuery hook

```tsx
const ProductComponent = ({ productId }) => {
    const { error, data, refetch } = useQuery<ProductQueryResult, ProductQueryVariables>(productQuery, { variables: { id: productId } });

    // display message if failed to retrieve data, with button to retry
    if (error) return <ErrorDisplay onClick={refetch}>{error.message}</ErrorDisplay>;

    // display loading if waiting for data to load
    if (!data) return <Loading />;

    return (
        <div>
            <h3>{data.product.name}</h3>
            <p>Price: ${data.product.price}</p>
        </div>
    );
};
```

### useMutation hook

```tsx
const UpdateProductPriceComponent = ({ productId }) => {
    const [updateProductPrice] = useMutation<ProductPriceMutationResult, ProductPriceMutationVariables>(updateProductPriceMutation);

    const handleSubmit = async (newPrice) => {
        try {
            const ret = await updateProductPrice({ variables: { id: productId, price: newPrice } });
            alert('Saved!');
        } catch {
            alert('Failure');
        }
    };

    return (
        <div>
            <button onClick={() => handleSubmit(50)}>Update Price to $50</button>
        </div>
    );
};
```

### useSubscription hook

The `useSubscription` hook provides a React-friendly way to execute GraphQL subscriptions with manual control over when the subscription starts and stops.

```tsx
const ProductPriceUpdateComponent = ({ productId }) => {
    const [subscribe] = useSubscription<ProductPriceSubscriptionResult, ProductPriceSubscriptionVariables>(
        priceUpdateSubscription,
        {
            variables: { id: productId },
            onData: (data) => {
                if (data.data) {
                    console.log("New price:", data.data.priceUpdate.price);
                } else {
                    console.error("Error:", data.errors);
                }
            },
            onClose: (reason) => {
                console.log("Subscription closed:", reason);
            },
            onOpen: () => {
                console.log("Subscription connected");
            }
        }
    );

    useEffect(() => {
        const { abort } = subscribe();

        return () => {
            abort();
        };
    }, [subscribe]); // subscribe is stable so long as the productId does not change

    return (
        <div>
            <p>Listening for price updates...</p>
        </div>
    );
};
```

### useAutoSubscription hook

The `useAutoSubscription` hook provides automatic subscription lifecycle management with built-in reconnection capabilities. The subscription automatically connects when the component mounts and disconnects when it unmounts.

```tsx
import { useAutoSubscription, AutoSubscriptionState } from '@shane32/graphql';

const ProductPriceUpdateComponent = ({ productId }) => {
    const { state } = useAutoSubscription<ProductPriceSubscriptionResult, ProductPriceSubscriptionVariables>(
        priceUpdateSubscription,
        {
            variables: { id: productId },
            onData: (data) => {
                if (data.data) {
                    console.log("New price:", data.data.priceUpdate.price);
                } else {
                    console.error("Error:", data.errors);
                }
            },
            onOpen: () => {
                console.log("Subscription connected");
            },
            onClose: (reason) => {
                console.log("Subscription closed:", reason);
            },
            enabled: true, // Can be used to enable/disable the subscription
            reconnectionStrategy: new BackoffReconnectionStrategy(1000, 30000, 2.0, 10, true)
        }
    );

    return (
        <div>
            <p>Status: {state}</p>
        </div>
    );
};
```

### Subscription Timeout Strategies

The client supports configurable timeout strategies for subscriptions to handle connection reliability and heartbeat management. You can set a default timeout strategy for all subscriptions or specify one per subscription.

**IdleTimeoutStrategy** aborts the subscription if no inbound messages are received within the specified timeout period.

```typescript
import { IdleTimeoutStrategy } from '@shane32/graphql';

// Abort subscription if no messages received for 30 seconds
const idleStrategy = new IdleTimeoutStrategy(30000);
```

**CorrelatedPingStrategy** sends periodic pings and expects matching pongs within a deadline. Aborts if pong is not received in time.

```typescript
import { CorrelatedPingStrategy } from '@shane32/graphql';

// Parameters: ackTimeoutMs, pingIntervalMs, pongDeadlineMs
const pingStrategy = new CorrelatedPingStrategy(5000, 10000, 3000);
```

You can set the default timeout strategy within the `defaultSubscriptionOptions` configuration setting as follows:

```typescript
const client = new GraphQLClient({
    url: 'https://api.example.com/graphql',
    webSocketUrl: 'wss://api.example.com/graphql',
    defaultSubscriptionOptions: {
        timeoutStrategy: new IdleTimeoutStrategy(30000)
    }
});
```

Alternatively, you can set the timeout strategy for a specific subscription when using `useSubscription`, `useAutoSubscription` or `executeSubscription`:

```typescript
const [subscribe] = useSubscription(subscription, {
    variables: { id: "123" },
    timeoutStrategy: new CorrelatedPingStrategy(5000, 10000, 3000),
    onData: (data) => console.log(data),
    onClose: () => console.log("Subscription closed")
});
```

## Subscription Reconnection Strategies

The `useAutoSubscription` hook supports configurable reconnection strategies to handle connection failures and automatic reconnection. You can set a default reconnection strategy for all auto-subscriptions or specify one per subscription.

**Fixed Delay Reconnection** - A simple strategy that waits a fixed delay between reconnection attempts:

```typescript
// Reconnect after 5 seconds
const { state } = useAutoSubscription(subscription, {
    variables: { id: "123" },
    reconnectionStrategy: 5000, // Simple number for fixed delay
    onData: (data) => console.log(data)
});
```

**DelayedReconnectionStrategy** - A more configurable fixed delay strategy:

```typescript
import { DelayedReconnectionStrategy } from '@shane32/graphql';

// Wait 3 seconds between attempts, maximum 8 attempts
const delayedStrategy = new DelayedReconnectionStrategy(3000, 8);

const { state } = useAutoSubscription(subscription, {
    variables: { id: "123" },
    reconnectionStrategy: delayedStrategy,
    onData: (data) => console.log(data)
});
```

**BackoffReconnectionStrategy** - Implements exponential backoff with optional jitter to prevent thundering herd problems:

```typescript
import { BackoffReconnectionStrategy } from '@shane32/graphql';

// Parameters: initialDelayMs, maxDelayMs, backoffMultiplier, maxAttempts, jitterEnabled
const backoffStrategy = new BackoffReconnectionStrategy(1000, 30000, 2.0, 10, true);

const { state } = useAutoSubscription(subscription, {
    variables: { id: "123" },
    reconnectionStrategy: backoffStrategy,
    onData: (data) => console.log(data)
});
```

The `BackoffReconnectionStrategy` also provides preset configurations:

```typescript
// Aggressive reconnection for quick recovery
const aggressive = BackoffReconnectionStrategy.createAggressive();

// Conservative reconnection to reduce server load
const conservative = BackoffReconnectionStrategy.createConservative();
```

You can set the default reconnection strategy within the `defaultSubscriptionOptions` configuration setting:

```typescript
const client = new GraphQLClient({
    url: 'https://api.example.com/graphql',
    webSocketUrl: 'wss://api.example.com/graphql',
    defaultSubscriptionOptions: {
        reconnectionStrategy: new BackoffReconnectionStrategy(1000, 30000, 2.0, 10, true)
    }
});
```

**Reconnection Behavior:**

- Reconnection strategies only apply to `useAutoSubscription`
- Server-initiated closures (normal completion or errors) do not trigger reconnection
- Client-initiated closures (manual abort) do not trigger reconnection
- Network failures and unexpected disconnections will trigger reconnection based on the strategy
- Each connection maintains independent reconnection state

## GraphQL Codegen Support

If you want to add GraphQL Codegen to your project, refer to [CODEGEN-README.md](https://github.com/Shane32/graphql/blob/main/CODEGEN-README.md)

## Creating Request Objects

You can use the `createRequest` function to construct GraphQL request objects that conform to the `IGraphQLRequest` interface:

```typescript
import { createRequest } from '@shane32/graphql';

// With a string query
const request = createRequest(
  `query GetProduct($id: ID!) { product(id: $id) { name price } }`,
  {
    variables: { id: "123" },
    extensions: { persistedQuery: true },
    operationName: "GetProduct"
  }
);

// With a TypedDocumentString (from codegen)
const request = createRequest(
  GetProductDocument,
  {
    variables: { id: "123" },
    extensions: { persistedQuery: true }
  }
);

// Use with a client
const result = await client.executeQueryRaw(request).result;
```

This is useful when you need to create request objects outside of the provided hooks, or when building custom GraphQL client implementations.

## API Reference

### GraphQLClient

#### Constructor Options

| Parameter                     | Default         | Description |
|-------------------------------|-----------------|-------------|
| `url` (required)              | -               | GraphQL endpoint URL |
| `webSocketUrl`                | -               | WebSocket endpoint URL for subscriptions |
| `defaultFetchPolicy`          | `'cache-first'` | Default caching strategy. Options: `'cache-first'`, `'no-cache'`, `'cache-and-network'` |
| `defaultCacheTime`            | `86400000`      | Cache duration in milliseconds (24 hours) |
| `maxCacheSize`                | `20971520`      | Maximum cache size in bytes (20MB) |
| `asForm`                      | `false`         | Use form data instead of JSON for requests |
| `sendDocumentIdAsQuery`       | `false`         | Include documentId as query parameter instead of POST body |
| `validateResponseContentType` | `false`         | Validate response content type before parsing* |
| `transformRequest`            | -               | Transform requests (e.g., add auth headers) |
| `generatePayload`             | -               | Generate WebSocket connection payload |
| `defaultSubscriptionOptions`  | -               | Default options for subscriptions (timeout & reconnection strategies) |
| `logHttpError`                | -               | Log HTTP errors |
| `logWebSocketConnectionError` | -               | Log WebSocket errors |

\* When `validateResponseContentType` is `true`, 2xx responses require `application/graphql-response+json` or `application/json` content type, and 4xx responses require `application/graphql-response+json` content type.

#### Methods

| Method | Description | Notes |
|--------|-------------|-------|
| `executeQueryRaw<TData, TVariables>` | Execute a GraphQL query | |
| `executeQuery<TData, TVariables>` | Execute a GraphQL query with caching | |
| `executeSubscription<TData, TVariables>` | Execute a GraphQL subscription | |
| `getPendingRequests` | Get count of pending requests | |
| `getActiveSubscriptions` | Get count of active subscriptions | |
| `refreshAll` | Refresh all cached queries | The `force` option cancels any in-progress requests and forces all cached queries to be refetched from the server, even if they are currently loading |
| `clearCache` | Clear the query cache | |
| `resetStore` | Reset and refresh all cached queries | Should be used anytime the user is logged in/out to refresh permissions |

### React Hooks

#### useQuery<TData, TVariables>

Execute a GraphQL query with caching and automatic re-rendering.

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `query` (required) | GraphQL query string or typed document |
| `options` | Query options |
| `options.variables` | Query variables |
| `options.fetchPolicy` | Caching strategy. Options: `'cache-first'`, `'no-cache'`, `'cache-and-network'` |
| `options.client` | Client instance or name from context |
| `options.guest` | Whether to use the guest client |
| `options.skip` | Whether to skip execution of the query |
| `options.autoRefetch` | Whether to automatically refetch when query/variables change |
| `options.operationName` | The name of the operation |
| `options.extensions` | Additional extensions to add to the query |

**Returns:**

| Property | Description |
|----------|-------------|
| `data` | Query result data |
| `errors` | Array of GraphQL errors or `undefined` |
| `error` | The first GraphQL error object if any errors occurred, otherwise `undefined` |
| `extensions` | Additional information returned by the query |
| `networkError` | Indicates whether a network error occurred |
| `loading` | Indicates whether the query is presently loading |
| `refetch` | Function to refetch the query |

#### useMutation<TData, TVariables>

Execute a GraphQL mutation.

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `mutation` (required) | GraphQL mutation string or typed document |
| `options` | Mutation options |
| `options.client` | Client instance or name from context |
| `options.guest` | Whether to use the guest client |
| `options.variables` | Default variables for the mutation |
| `options.operationName` | The name of the operation |
| `options.extensions` | Additional extensions to add to the mutation |

**Returns:**

| Index | Description |
|-------|-------------|
| `[0]` | Mutation function that returns a promise |

#### useSubscription<TData, TVariables>

Execute a GraphQL subscription with manual control over when the subscription starts and stops.

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `query` (required) | GraphQL subscription string or typed document |
| `options` | Subscription options |
| `options.variables` | Subscription variables |
| `options.client` | Client instance or name from context |
| `options.guest` | Whether to use the guest client |
| `options.operationName` | The name of the operation |
| `options.extensions` | Additional extensions to add to the subscription |
| `options.timeoutStrategy` | Timeout strategy for the subscription |
| `options.onData` | Callback function to invoke when new data is received |
| `options.onClose` | Callback function to invoke when the subscription is closed |
| `options.onOpen` | Callback function to invoke when the subscription connection is opened |

**Returns:**

| Index | Description |
|-------|-------------|
| `[0]` | Subscription function that returns `{ connected: Promise<void>; abort: () => void }` |

#### useAutoSubscription<TData, TVariables>

Execute a GraphQL subscription with automatic lifecycle management and reconnection capabilities.

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `query` (required) | GraphQL subscription string or typed document |
| `options` | Auto-subscription options |
| `options.variables` | Subscription variables or function that returns variables |
| `options.client` | Client instance or name from context |
| `options.guest` | Whether to use the guest client |
| `options.operationName` | The name of the operation |
| `options.extensions` | Additional extensions to add to the subscription |
| `options.timeoutStrategy` | Timeout strategy for the subscription |
| `options.reconnectionStrategy` | Reconnection strategy for automatic reconnection |
| `options.enabled` | Whether the subscription should be enabled (default: true) |
| `options.onData` | Callback function to invoke when new data is received |
| `options.onClose` | Callback function to invoke when the subscription is closed |
| `options.onOpen` | Callback function to invoke when the subscription connection is opened |

**Returns:**

| Property | Description |
|----------|-------------|
| `state` | Current state of the subscription (AutoSubscriptionState enum) |

**AutoSubscriptionState Values:**

| State | Description |
|-------|-------------|
| `Disconnected` | The subscription is not connected |
| `Connecting` | The subscription is in the process of connecting or reconnecting |
| `Connected` | The subscription is connected and receiving data |
| `Error` | The subscription has failed and reconnection attempts have been exhausted |
| `Rejected` | The subscription was rejected by the server |
| `Completed` | The subscription was completed by the server |

### Context

#### GraphQLContext

React context for providing GraphQL clients to hooks.

**Interface:**

```typescript
interface IGraphQLContext {
  client: IGraphQLClient;        // Default client
  [key: string]: IGraphQLClient; // Additional named clients
}
```

### Timeout Strategies

#### IdleTimeoutStrategy

Aborts subscriptions if no inbound messages are received within the specified timeout period.

**Constructor:**

- `idleMs` (number): Timeout in milliseconds

#### CorrelatedPingStrategy

Sends periodic pings and expects matching pongs within a deadline. Aborts if pong is not received in time.

**Constructor:**

- `ackTimeoutMs` (number): Connection acknowledgment timeout in milliseconds
- `pingIntervalMs` (number): Interval between ping messages in milliseconds
- `pongDeadlineMs` (number): Maximum time to wait for pong response in milliseconds

## Testing

This package includes a `GraphQLTestClient` for easy testing and mocking:

```typescript
import { GraphQLTestClient } from '@shane32/graphql';

describe('GraphQL Tests', () => {
  let testClient: GraphQLTestClient;

  beforeEach(() => {
    testClient = new GraphQLTestClient();
  });

  it('should mock query responses', async () => {
    // Mock a query response
    testClient.mockQuery(
      'query GetUser($id: ID!) { user(id: $id) { name email } }',
      { user: { name: 'John Doe', email: 'john@example.com' } }
    );

    // Execute the query
    const result = await testClient.executeQueryRaw({
      query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
      variables: { id: '123' }
    }).result;

    expect(result.data.user.name).toBe('John Doe');
  });

  it('should mock error responses', () => {
    // Mock an error response
    testClient.mockError(
      'query GetUser($id: ID!) { user(id: $id) { name } }',
      new Error('User not found')
    );

    // The query will throw the mocked error
    expect(() =>
      testClient.executeQueryRaw({
        query: 'query GetUser($id: ID!) { user(id: $id) { name } }',
        variables: { id: '999' }
      })
    ).toThrow('User not found');
  });
});
```

### Testing with React Components

```tsx
import { render, screen } from '@testing-library/react';
import { GraphQLContext, GraphQLTestClient } from '@shane32/graphql';
import UserProfile from './UserProfile';

test('renders user profile', async () => {
  const testClient = new GraphQLTestClient();
  
  testClient.mockQuery(
    'query GetUser($id: ID!) { user(id: $id) { name email } }',
    { user: { name: 'John Doe', email: 'john@example.com' } }
  );

  render(
    <GraphQLContext.Provider value={{ client: testClient }}>
      <UserProfile userId="123" />
    </GraphQLContext.Provider>
  );

  expect(await screen.findByText('John Doe')).toBeInTheDocument();
  expect(screen.getByText('john@example.com')).toBeInTheDocument();
});
```

## Troubleshooting

### Common Issues

#### Fetch API not available
This package requires the Fetch API. For older browsers or test environments:

```javascript
// Install a polyfill
npm install whatwg-fetch

// Import in your app or test setup
import 'whatwg-fetch';
```

#### WebSocket connection fails

- Ensure your GraphQL server supports the [graphql-ws](https://github.com/enisdenjo/graphql-ws) protocol
- Check that the WebSocket URL is correct and accessible
- Verify authentication if required using the `generatePayload` option

#### TypeScript errors with queries

- Ensure you have the correct peer dependencies installed
- Use proper TypeScript generics with hooks:

  ```typescript
  const { data } = useQuery<QueryResult, QueryVariables>(query, options);
  ```

#### Caching issues

- Use `fetchPolicy: 'no-cache'` to bypass cache for testing
- Clear cache manually if needed (implementation depends on your setup)
- Check `defaultCacheTime` and `maxCacheSize` settings

#### Authentication problems

- Use `transformRequest` to add authentication headers:

  ```typescript
  const client = new GraphQLClient({
    url: 'https://api.example.com/graphql',
    transformRequest: async (request) => {
      const token = await getAuthToken();
      if (!request.headers) {
        request.headers = {};
      }
      request.headers['Authorization'] = `Bearer ${token}`;
      return request;
    }
  });
  ```

## Credits

Glory to Jehovah, Lord of Lords and King of Kings, creator of Heaven and Earth, who through his Son Jesus Christ,
has reedemed me to become a child of God. -Shane32
