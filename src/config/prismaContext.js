import { AsyncLocalStorage } from 'async_hooks';

export const prismaContext = new AsyncLocalStorage();