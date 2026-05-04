import type { FoodGroup, GroupKey, ID, Meal, QuantityOption, UnitType } from "@/lib/types";

export interface SeedGroupDef {
  key: GroupKey;
  label: string;
  removable: boolean;
}

/** Canonical group order used when creating a new profile. */
export const SEED_GROUPS: SeedGroupDef[] = [
  { key: "VERDURAS", label: "Verduras", removable: false },
  { key: "FRUTAS", label: "Frutas", removable: false },
  { key: "CEREALES", label: "Cereales", removable: false },
  { key: "LEGUMINOSAS", label: "Leguminosas", removable: false },
  { key: "LECHES", label: "Leches", removable: false },
  { key: "AOA", label: "Alimentos de origen animal (AOA)", removable: false },
  { key: "AZUCARES", label: "Azúcares", removable: false },
  { key: "ACEITE_A", label: "Aceite tipo A", removable: false },
  { key: "ACEITE_B", label: "Aceite tipo B", removable: false },
  { key: "OTROS_1", label: "Otros 1", removable: true },
  { key: "OTROS_2", label: "Otros 2", removable: true },
  { key: "OTROS_3", label: "Otros 3", removable: true },
];

export interface SeedMealDef {
  key: string;
  label: string;
  time?: string;
}

export const SEED_MEALS: SeedMealDef[] = [
  { key: "DESAYUNO", label: "Desayuno", time: "08:00" },
  { key: "COLACION_AM", label: "Colación de medio día", time: "11:00" },
  { key: "COMIDA", label: "Comida", time: "14:30" },
  { key: "COLACION_PM", label: "Colación de la tarde", time: "17:30" },
  { key: "CENA", label: "Cena", time: "20:30" },
];

/** Default measurement units when creating a new profile. */
export const SEED_UNITS: string[] = ["Piezas", "Gramos", "Tazas"];

/** Default selectable quantity values (quarter steps). */
export const SEED_QUANTITIES: number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

export type SeedUnit = "Piezas" | "Gramos" | "Tazas";

/** Seed catalog of foods (es-MX), keyed by GroupKey.
 *  Each food has a quantity expressed in one of the SEED_UNITS. */
export const SEED_FOODS: Record<
  string,
  { name: string; unit: SeedUnit; quantity: number }[]
> = {
  VERDURAS: [
    { name: "Nopal", unit: "Tazas", quantity: 1 },
    { name: "Espinaca cruda", unit: "Tazas", quantity: 2 },
    { name: "Jitomate", unit: "Piezas", quantity: 1 },
    { name: "Calabacita", unit: "Tazas", quantity: 1 },
    { name: "Brócoli", unit: "Tazas", quantity: 1 },
    { name: "Lechuga", unit: "Tazas", quantity: 2 },
    { name: "Pepino", unit: "Piezas", quantity: 1 },
    { name: "Zanahoria rallada", unit: "Tazas", quantity: 0.5 },
    { name: "Chayote", unit: "Tazas", quantity: 1 },
    { name: "Champiñones", unit: "Tazas", quantity: 1 },
  ],
  FRUTAS: [
    { name: "Manzana", unit: "Piezas", quantity: 1 },
    { name: "Plátano tabasco", unit: "Piezas", quantity: 0.5 },
    { name: "Papaya picada", unit: "Tazas", quantity: 1 },
    { name: "Piña", unit: "Tazas", quantity: 0.75 },
    { name: "Sandía", unit: "Tazas", quantity: 1 },
    { name: "Melón", unit: "Tazas", quantity: 1 },
    { name: "Fresas", unit: "Tazas", quantity: 1 },
    { name: "Mandarina", unit: "Piezas", quantity: 2 },
    { name: "Pera", unit: "Piezas", quantity: 1 },
    { name: "Mango", unit: "Piezas", quantity: 0.5 },
  ],
  CEREALES: [
    { name: "Tortilla de maíz", unit: "Piezas", quantity: 1 },
    { name: "Pan integral", unit: "Piezas", quantity: 1 },
    { name: "Arroz cocido", unit: "Tazas", quantity: 0.5 },
    { name: "Avena", unit: "Tazas", quantity: 0.5 },
    { name: "Pasta cocida", unit: "Tazas", quantity: 0.5 },
    { name: "Galletas marías", unit: "Piezas", quantity: 5 },
    { name: "Tostada horneada", unit: "Piezas", quantity: 2 },
    { name: "Bolillo", unit: "Piezas", quantity: 0.5 },
    { name: "Papa cocida", unit: "Piezas", quantity: 1 },
    { name: "Elote", unit: "Piezas", quantity: 0.5 },
  ],
  LEGUMINOSAS: [
    { name: "Frijoles cocidos", unit: "Tazas", quantity: 0.5 },
    { name: "Lentejas cocidas", unit: "Tazas", quantity: 0.5 },
    { name: "Garbanzos cocidos", unit: "Tazas", quantity: 0.5 },
    { name: "Habas cocidas", unit: "Tazas", quantity: 0.5 },
    { name: "Soya texturizada", unit: "Tazas", quantity: 0.5 },
  ],
  LECHES: [
    { name: "Leche descremada", unit: "Tazas", quantity: 1 },
    { name: "Leche entera", unit: "Tazas", quantity: 1 },
    { name: "Yogurt natural light", unit: "Tazas", quantity: 1 },
    { name: "Leche de almendra sin azúcar", unit: "Tazas", quantity: 1 },
    { name: "Queso cottage", unit: "Tazas", quantity: 0.5 },
  ],
  AOA: [
    { name: "Pechuga de pollo", unit: "Gramos", quantity: 30 },
    { name: "Huevo entero", unit: "Piezas", quantity: 1 },
    { name: "Clara de huevo", unit: "Piezas", quantity: 2 },
    { name: "Atún en agua", unit: "Gramos", quantity: 30 },
    { name: "Filete de pescado", unit: "Gramos", quantity: 30 },
    { name: "Carne de res magra", unit: "Gramos", quantity: 30 },
    { name: "Queso panela", unit: "Gramos", quantity: 30 },
    { name: "Jamón de pavo", unit: "Piezas", quantity: 2 },
  ],
  AZUCARES: [
    { name: "Azúcar de mesa", unit: "Piezas", quantity: 1 },
    { name: "Miel de abeja", unit: "Piezas", quantity: 1 },
    { name: "Mermelada", unit: "Piezas", quantity: 2 },
    { name: "Cajeta", unit: "Piezas", quantity: 1 },
  ],
  ACEITE_A: [
    { name: "Aguacate", unit: "Piezas", quantity: 0.5 },
    { name: "Almendras", unit: "Piezas", quantity: 10 },
    { name: "Nuez", unit: "Piezas", quantity: 3 },
    { name: "Cacahuates", unit: "Piezas", quantity: 14 },
    { name: "Aceite de oliva", unit: "Piezas", quantity: 1 },
  ],
  ACEITE_B: [
    { name: "Mantequilla", unit: "Piezas", quantity: 1 },
    { name: "Crema", unit: "Piezas", quantity: 1 },
    { name: "Queso crema", unit: "Piezas", quantity: 1 },
    { name: "Tocino", unit: "Piezas", quantity: 1 },
  ],
  OTROS_1: [],
  OTROS_2: [],
  OTROS_3: [],
};

/** Build initial groups + meals + units + quantities for a new profile. */
export function makeSeedFor(profileId: ID): {
  groups: FoodGroup[];
  meals: Meal[];
  units: UnitType[];
  quantities: QuantityOption[];
} {
  const groups: FoodGroup[] = SEED_GROUPS.map((g, i) => ({
    id: `${profileId}:g:${g.key}`,
    profileId,
    key: g.key,
    label: g.label,
    order: i,
    removable: g.removable,
  }));
  const meals: Meal[] = SEED_MEALS.map((m, i) => ({
    id: `${profileId}:m:${m.key}`,
    profileId,
    key: m.key,
    label: m.label,
    order: i,
    time: m.time,
  }));
  const units: UnitType[] = SEED_UNITS.map((label, i) => ({
    id: `${profileId}:u:${i}`,
    profileId,
    label,
    order: i,
  }));
  const quantities: QuantityOption[] = SEED_QUANTITIES.map((value, i) => ({
    id: `${profileId}:q:${i}`,
    profileId,
    value,
    order: i,
  }));
  return { groups, meals, units, quantities };
}
