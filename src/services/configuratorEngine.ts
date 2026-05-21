/**
 * Configurator Engine (Fase 4)
 * Validates a customer's selections against the configurator definition and computes the final price.
 *
 * Selection shape (what the cart/order endpoint sends):
 *   [
 *     { group_id: "size", option_ids: ["medium"] },
 *     { group_id: "toppings", option_ids: ["pepperoni", "olives"] },
 *   ]
 */

import type { ConfiguratorConfig, ConfiguratorGroup, ConfiguratorOption } from "../types";

export interface ConfiguratorSelection {
  group_id: string;
  option_ids: string[];
}

export interface ResolvedSelection {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_delta: number;
}

export interface ConfiguratorResolution {
  selections: ResolvedSelection[];
  price_delta_total: number;
  /** Human-readable summary for the order item: "Tamanho: Média | Sabores: Calabresa, Mussarela" */
  summary: string;
}

export class ConfiguratorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfiguratorValidationError";
  }
}

function findGroup(config: ConfiguratorConfig, groupId: string): ConfiguratorGroup | null {
  if (!config?.groups) return null;
  return config.groups.find((g) => String(g.id) === String(groupId)) || null;
}

function findOption(group: ConfiguratorGroup, optionId: string): ConfiguratorOption | null {
  if (!group?.options) return null;
  return group.options.find((o) => String(o.id) === String(optionId) && o.is_active !== false) || null;
}

/**
 * Validate selections against the configurator definition.
 * Throws on missing required groups, invalid options, min/max violations.
 * Returns the resolved selections with computed price delta.
 */
export function resolveConfigurator(
  config: ConfiguratorConfig | null | undefined,
  selections: ConfiguratorSelection[] | null | undefined
): ConfiguratorResolution {
  const empty: ConfiguratorResolution = { selections: [], price_delta_total: 0, summary: "" };
  if (!config || !config.enabled || !Array.isArray(config.groups) || config.groups.length === 0) {
    return empty;
  }

  const selectionMap = new Map<string, string[]>();
  if (Array.isArray(selections)) {
    for (const sel of selections) {
      if (!sel?.group_id) continue;
      const ids = Array.isArray(sel.option_ids) ? sel.option_ids.filter(Boolean).map(String) : [];
      selectionMap.set(String(sel.group_id), ids);
    }
  }

  const resolved: ResolvedSelection[] = [];
  let priceDelta = 0;
  const summaryParts: string[] = [];

  for (const group of config.groups) {
    const chosenIds = selectionMap.get(String(group.id)) || [];
    const minSelect = Number(group.min_select ?? (group.required ? 1 : 0));
    const maxSelect = Number(group.max_select ?? 1);

    if (chosenIds.length < minSelect) {
      throw new ConfiguratorValidationError(
        `Grupo "${group.name}" exige no mínimo ${minSelect} opção(ões), recebido ${chosenIds.length}`
      );
    }
    if (chosenIds.length > maxSelect) {
      throw new ConfiguratorValidationError(
        `Grupo "${group.name}" aceita no máximo ${maxSelect} opção(ões), recebido ${chosenIds.length}`
      );
    }

    const chosenNames: string[] = [];
    for (const optId of chosenIds) {
      const option = findOption(group, optId);
      if (!option) {
        throw new ConfiguratorValidationError(
          `Opção inválida em "${group.name}": ${optId}`
        );
      }
      const delta = Number(option.price_delta || 0);
      priceDelta += delta;
      chosenNames.push(option.name);
      resolved.push({
        group_id: String(group.id),
        group_name: String(group.name),
        option_id: String(option.id),
        option_name: String(option.name),
        price_delta: delta,
      });
    }

    if (chosenNames.length > 0) {
      summaryParts.push(`${group.name}: ${chosenNames.join(", ")}`);
    }
  }

  return {
    selections: resolved,
    price_delta_total: Math.round(priceDelta * 100) / 100,
    summary: summaryParts.join(" | "),
  };
}
