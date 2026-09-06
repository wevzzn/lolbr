import { Item, Player, PlayerPriorityMode } from '../types';
import { parseCP } from './formatters';

const getEligiblePlayers = (item: Item, players: Player[]): Player[] =>
    players.filter(player =>
        player.isActive !== false
        && !(player.excludedItemIds ?? []).includes(item.id)
    );

export const sortPlayersByPriority = (players: Player[], mode: PlayerPriorityMode): Player[] =>
    [...players].sort((a, b) => {
        if (mode === 'manual') {
            const positionDifference = (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
            if (positionDifference !== 0) return positionDifference;
        }
        const cpDifference = parseCP(b.cp) - parseCP(a.cp);
        return cpDifference !== 0 ? cpDifference : a.name.localeCompare(b.name);
    });

export const getOriginalPlayerQueue = (
    item: Item,
    players: Player[],
    applyTop5Limit: boolean = true,
    priorityMode: PlayerPriorityMode = 'cp'
): Player[] => {
    let queue = sortPlayersByPriority(players.filter(player => player.isActive !== false), priorityMode);

    if (item.limitToTop5 && applyTop5Limit) queue = queue.slice(0, 5);
    queue = queue.filter(player => !(player.excludedItemIds ?? []).includes(item.id));

    if (item.lastRecipientId && queue.length > 0) {
        const lastIndex = queue.findIndex(player => player.id === item.lastRecipientId);
        if (lastIndex !== -1) {
            const nextIndex = (lastIndex + 1) % queue.length;
            queue = [...queue.slice(nextIndex), ...queue.slice(0, nextIndex)];
        }
    }

    return queue;
};

export const getPlayerQueue = (item: Item, players: Player[], applyTop5Limit: boolean = true, priorityMode: PlayerPriorityMode = 'cp'): Player[] => {
    if (!item.manualQueueEnabled || item.limitToTop5) {
        return getOriginalPlayerQueue(item, players, applyTop5Limit, priorityMode);
    }

    const eligiblePlayers = getEligiblePlayers(item, players);

    const playersById = new Map(eligiblePlayers.map(player => [player.id, player]));
    const orderedPlayers: Player[] = [];

    for (const playerId of item.queuePlayerIds ?? []) {
        const player = playersById.get(playerId);
        if (player) {
            orderedPlayers.push(player);
            playersById.delete(playerId);
        }
    }

    const missingPlayers = [...playersById.values()]
        .sort((a, b) => parseCP(b.cp) - parseCP(a.cp));

    let sorted = item.queuePlayerIds
        ? [...orderedPlayers, ...missingPlayers]
        : [...missingPlayers];

    // 2. Filter Top 5 if item has limit enabled
    if (item.limitToTop5 && applyTop5Limit) {
        sorted = sorted.slice(0, 5);
    }

    // Legacy documents are rotated from their last recipient once. Persisted queues
    // already represent the next player at index zero.
    if (!item.queuePlayerIds) return getOriginalPlayerQueue(item, players, applyTop5Limit, priorityMode);

    return sorted;
};

export const getQueuePlayerIds = (item: Item, players: Player[], priorityMode: PlayerPriorityMode = 'cp'): string[] =>
    getPlayerQueue(item, players, true, priorityMode).map(player => player.id);

export const rotateQueueThroughPlayer = (queuePlayerIds: string[], playerId: string): string[] => {
    const playerIndex = queuePlayerIds.indexOf(playerId);
    if (playerIndex === -1) return queuePlayerIds;

    return [
        ...queuePlayerIds.slice(playerIndex + 1),
        ...queuePlayerIds.slice(0, playerIndex + 1)
    ];
};

export const movePlayerToQueueEnd = (queuePlayerIds: string[], playerId: string): string[] => {
    if (!queuePlayerIds.includes(playerId)) return queuePlayerIds;
    return [...queuePlayerIds.filter(id => id !== playerId), playerId];
};

export const getNewPlayerInsertionIndex = (
    queuePlayerIds: string[],
    appendToQueueEnd: boolean
): number => {
    return appendToQueueEnd ? queuePlayerIds.length : 0;
};
