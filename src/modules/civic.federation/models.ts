export interface ActivityStreamsObject {
  "@context": (string | Record<string, string>)[];
  id: string;
  type: string[];
  summary: string;
  content: string;
  attributedTo: string;
  published: string;
  updated?: string;
  url: string;
  to: string[];
}

export interface ActivityPubActor {
  "@context": (string | Record<string, string>)[];
  id: string;
  type: "Service";
  preferredUsername: string;
  name: string;
  summary: string;
  inbox: string;
  outbox: string;
  url: string;
  publicKey: {
    id: string;
    owner: string;
    publicKeyPem: string;
  };
}

export interface WebfingerResponse {
  subject: string;
  links: {
    rel: string;
    type: string;
    href: string;
  }[];
}

export interface OrderedCollection {
  "@context": string;
  id: string;
  type: "OrderedCollection";
  totalItems: number;
  orderedItems: unknown[];
}
