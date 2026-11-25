import { supabase } from './supabase'
import { useLive } from './useLive'

export const CATEGORIES = [
  { key: 'noodle', label: 'ขนมจีน' },
  { key: 'side', label: 'ของทานเล่น' },
  { key: 'drink', label: 'เครื่องดื่ม' },
]

async function must(q) {
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function fetchMenu() {
  const [items, groups, options, links] = await Promise.all([
    must(supabase.from('menu_items').select('*').order('sort_order').order('id')),
    must(supabase.from('option_groups').select('*').order('sort_order').order('id')),
    must(supabase.from('options').select('*').order('sort_order').order('id')),
    must(supabase.from('menu_item_option_groups').select('*').order('sort_order')),
  ])
  const groupById = new Map(groups.map((g) => [g.id, { ...g, options: options.filter((o) => o.group_id === g.id) }]))
  return {
    groups: [...groupById.values()],
    options,
    items: items.map((it) => ({
      ...it,
      price: Number(it.price),
      groups: links.filter((l) => l.menu_item_id === it.id).map((l) => groupById.get(l.group_id)).filter(Boolean),
    })),
  }
}

// menu with sold-out flags kept live
export function useMenu() {
  return useLive(['menu_items', 'options'], fetchMenu, { interval: 30000 })
}

// is this item orderable at all? (sold out, or a required group has nothing left)
export function itemSoldOut(item) {
  if (!item.is_available) return true
  return item.groups.some((g) => g.min_select > 0 && g.options.filter((o) => o.is_available).length < g.min_select)
}

export function unitPrice(item, optionIds) {
  const ids = new Set(optionIds)
  let p = Number(item.price)
  for (const g of item.groups) for (const o of g.options) if (ids.has(o.id)) p += Number(o.price_delta)
  return p
}
