import { v4 as uuidv4 } from "uuid";

function createUuidFromMathRandom() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

  return template.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;

    return value.toString(16);
  });
}

export function createUuid() {
  try {
    return uuidv4();
  } catch {
    return createUuidFromMathRandom();
  }
}
