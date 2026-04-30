import { tickets } from "./src/schema";
const symbols = Object.getOwnPropertySymbols(tickets);
const nameSymbol = symbols.find(s => s.description === "drizzle:Name");
console.log(nameSymbol ? tickets[nameSymbol] : "Not found");
