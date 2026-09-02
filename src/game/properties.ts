import type { PropertyOffer } from '../types/game'

export const BASE_GARAGE_CAPACITY = 3
export const PROPERTY_CHARGE_CYCLE_MS = 24 * 60 * 60 * 1_000

export const PROPERTY_MARKET: PropertyOffer[] = [
  {
    id: 'box-quartier',
    name: 'Box de quartier',
    district: 'Faubourg',
    description: 'Deux places sèches, disponibles immédiatement pour absorber les premières affaires.',
    capacity: 2,
    acquisitionMode: 'rent',
    acquisitionCost: 2_400,
    rentPerCycle: 180,
    chargesPerCycle: 35,
    workCost: 0,
    workDurationSeconds: 0,
  },
  {
    id: 'atelier-cour',
    name: 'Atelier de cour',
    district: 'Zone artisanale',
    description: 'Un vrai espace de préparation, à remettre aux normes avant de recevoir du stock.',
    capacity: 4,
    acquisitionMode: 'rent',
    acquisitionCost: 5_500,
    rentPerCycle: 420,
    chargesPerCycle: 80,
    workCost: 2_500,
    workDurationSeconds: 24,
  },
  {
    id: 'entrepot-peripherique',
    name: 'Entrepôt périphérique',
    district: 'Rocade nord',
    description: 'Huit places et une structure durable pour passer d’opportuniste à marchand installé.',
    capacity: 8,
    acquisitionMode: 'purchase',
    acquisitionCost: 42_000,
    rentPerCycle: 0,
    chargesPerCycle: 260,
    workCost: 7_500,
    workDurationSeconds: 45,
  },
  {
    id: 'showroom-avenue',
    name: 'Showroom avenue',
    district: 'Entrée de ville',
    description: 'Une adresse vitrine à forte capacité, pensée pour une collection et un stock ambitieux.',
    capacity: 12,
    acquisitionMode: 'purchase',
    acquisitionCost: 95_000,
    rentPerCycle: 0,
    chargesPerCycle: 650,
    workCost: 18_000,
    workDurationSeconds: 75,
  },
  {
    id: 'grand-garage-autyco',
    name: 'Grand Garage AUTYCO',
    district: 'Boulevard des ateliers',
    description: 'Le siège de ton empire : 24 places, une galerie de collection et les espaces nécessaires pour constituer une équipe.',
    capacity: 24,
    acquisitionMode: 'purchase',
    acquisitionCost: 750_000,
    rentPerCycle: 0,
    chargesPerCycle: 4_500,
    workCost: 0,
    workDurationSeconds: 0,
  },
]

export const GRAND_GARAGE_ID = 'grand-garage-autyco'
