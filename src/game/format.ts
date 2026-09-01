import type { RiskLevel, VehicleStatus } from '../types/game'

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('fr-FR')

export const formatMoney = (value: number) => moneyFormatter.format(value)
export const formatNumber = (value: number) => numberFormatter.format(value)

export const formatRemaining = (target: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((target - now) / 1_000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${seconds % 60} s`
}

export const riskLabel: Record<RiskLevel, string> = {
  low: 'Risque faible',
  medium: 'Risque moyen',
  high: 'Risque élevé',
}

export const statusLabel: Record<VehicleStatus, string> = {
  'needs-diagnosis': 'À diagnostiquer',
  'needs-decision': 'À préparer',
  repairing: 'En réparation',
  ready: 'À préparer',
  listed: 'En vente',
  'offer-received': 'Offre reçue',
}

