import { randomUUID as nodeUUID } from 'node:crypto';
export const randomUUID = () => nodeUUID();
