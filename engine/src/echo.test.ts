import { describe, expect, test } from "bun:test";
import { isEcho, words } from "./echo";

describe("words", () => {
  test("sin tildes ni puntuación, con los números en cifras", () => {
    expect(words("Cien, doscientos y 1.650 dólares")).toEqual(["100", "200", "y", "1650", "dolares"]);
  });
});

describe("isEcho", () => {
  test("una frase casi igual a la de la Contraparte es eco", () => {
    expect(isEcho("el anticipo es del cincuenta por ciento", "El anticipo es del cincuenta por ciento del total.")).toBe(true);
  });
  test("una frase corta o distinta no lo es", () => {
    expect(isEcho("Sí, claro.", "Sí, claro, como te decía.")).toBe(false);
    expect(isEcho("¿Eso incluye el IVA o va aparte?", "El servicio cuesta dieciocho millones.")).toBe(false);
  });
});
