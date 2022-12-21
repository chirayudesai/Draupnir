import { LogLevel, LogService } from "matrix-bot-sdk";
import { Mjolnir } from "../Mjolnir";
import { Protection } from "./IProtection";
import { NumberProtectionSetting } from "./ProtectionSettings";

export const DEFAULT_MAX_MENTIONS = 10;

export class MentionFlood extends Protection {
    settings = {
        maxMentions: new NumberProtectionSetting(DEFAULT_MAX_MENTIONS),
    };

    constructor() {
        super();
    }

    public get name(): string {
        return 'MentionFloodProtection';
    }

    public get description(): string {
        return `Mutes a user if they try to spam mentions more than ${DEFAULT_MAX_MENTIONS}.`;
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        const content = event['content'] || { };

        if (event['type'] !== 'm.room.message') return;

        const message: string = content['formatted_body'] || content['body'] || null;

        if (message && (message.match(/@[^:]*:\S+/gi)?.length || 0) > this.settings.maxMentions.value) {
            await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, __filename, `Muting ${event['sender']}`);

            const powerLevels = await mjolnir.client.getRoomStateEvent(roomId, 'm.room.power_levels', '') as {users: Record<string, number>};

            powerLevels.users[event['sender']] = -1;

            try {
                await mjolnir.client.sendStateEvent(roomId, 'm.room.power_levels', '', powerLevels);
            } catch (exception) {
                LogService.warn(__filename, 'COULD NOT MUTE USER', exception);
            }
        }

    }
}
