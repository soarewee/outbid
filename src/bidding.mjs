// The bidding: vendors' agents compete on one anonymous intent, round by round, until nobody undercuts.
// Round 1, every agent opens. After each round the bids are priced in the buyer's currency (Airwallex FX)
// and ranked on total cost over the term; every agent that isn't leading is told the price it has to
// beat, in its own currency and billing period, and either goes lower or stops. The leader is never
// asked to bid against itself. It ends when a whole round passes, or after `maxRounds`.
// Running the rounds and ranking them is code; what each vendor bids is its own agent's call.
import { priceBids } from "./auction.mjs";

const floorCents = (n) => Math.floor(n * 100) / 100;

export async function runBidding({ intent, currency, rate, agents, maxRounds = 8, onRound = () => {} }) {
  const standing = new Map(); // vendor → its current bid
  const history = new Map(agents.map((a) => [a.name, []]));
  const out = new Set(); // agents that have stopped
  const rounds = [];

  for (let n = 1; n <= maxRounds; n++) {
    const ranked = standing.size ? await priceBids([...standing.values()], intent, currency, rate) : [];
    const leader = ranked[0] ?? null;
    const asked = agents.filter((a) => !out.has(a.name) && a.name !== leader?.vendor);
    if (!asked.length) break;

    const moves = await Promise.all(asked.map(async (agent) => {
      // The leader's cost per billing period of this vendor's plan, in this vendor's currency, per unit.
      let toBeat = null;
      if (leader) {
        const months = agent.billing === "annual" ? 12 : 1;
        toBeat = floorCents((leader.perMonth * months * (await rate(currency, agent.currency))) / intent.quantity);
      }
      const current = standing.get(agent.name) ?? null;
      const made = await agent.move(intent, { toBeat, current: current ? current.price.amount / intent.quantity : null, history: history.get(agent.name) });
      return { agent, toBeat, opened: Boolean(current), ...made };
    }));

    for (const m of moves) {
      if (m.bid) standing.set(m.agent.name, m.bid);
      else out.add(m.agent.name);
      history.get(m.agent.name).push({ round: n, priceToBeatPerUnit: m.toBeat, yourPricePerUnit: m.bid ? m.bid.price.amount / intent.quantity : null, youStopped: !m.bid });
    }
    const after = await priceBids([...standing.values()], intent, currency, rate);
    const round = {
      n,
      leader: after[0]?.vendor ?? null,
      moves: moves.map((m) => {
        const bid = m.bid ?? standing.get(m.agent.name) ?? null;
        const priced = bid && after.find((b) => b.vendor === bid.vendor);
        return {
          vendor: m.agent.name,
          action: !m.bid ? "pass" : m.opened ? "lower" : "open",
          price: bid?.price ?? null,
          billing: bid?.billing ?? m.agent.billing,
          perMonth: priced?.perMonth ?? null,
          total: priced?.total ?? null,
          message: m.message || null,
          reasoning: m.reasoning || null,
          model: m.model ?? null,
        };
      }),
    };
    rounds.push(round);
    await onRound(round);
    if (moves.every((m) => !m.bid)) break;
  }
  return { bids: [...standing.values()], rounds };
}
