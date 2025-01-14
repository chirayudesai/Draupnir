/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { DraupnirBaseExecutor, DraupnirContext } from "./CommandHandler";
import {
  ActionResult,
  MatrixRoomReference,
  MultipleErrors,
  PolicyRuleType,
  RoomActionError,
  RoomUpdateError,
  isError,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  findPresentationType,
  parameters,
  ParsedKeywords,
} from "./interface-manager/ParameterParsing";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

export async function importCommand(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  importFromRoomReference: MatrixRoomReference,
  policyRoomReference: MatrixRoomReference
): Promise<ActionResult<void>> {
  const importFromRoom = await resolveRoomReferenceSafe(
    this.client,
    importFromRoomReference
  );
  if (isError(importFromRoom)) {
    return importFromRoom;
  }
  const policyRoom = await resolveRoomReferenceSafe(
    this.client,
    policyRoomReference
  );
  if (isError(policyRoom)) {
    return policyRoom;
  }
  const policyRoomEditor =
    await this.draupnir.policyRoomManager.getPolicyRoomEditor(policyRoom.ok);
  if (isError(policyRoomEditor)) {
    return policyRoomEditor;
  }
  const state = await this.client.getRoomState(
    importFromRoom.ok.toRoomIDOrAlias()
  );
  const errors: RoomUpdateError[] = [];
  for (const stateEvent of state) {
    const content = stateEvent["content"] || {};
    if (!content || Object.keys(content).length === 0) continue;

    if (
      stateEvent["type"] === "m.room.member" &&
      stateEvent["state_key"] !== ""
    ) {
      // Member event - check for ban
      if (content["membership"] === "ban") {
        const reason = content["reason"] || "<no reason>";
        const result = await policyRoomEditor.ok.banEntity(
          PolicyRuleType.User,
          stateEvent["state_key"],
          reason
        );
        if (isError(result)) {
          errors.push(
            RoomActionError.fromActionError(policyRoom.ok, result.error)
          );
        }
      }
    } else if (
      stateEvent["type"] === "m.room.server_acl" &&
      stateEvent["state_key"] === ""
    ) {
      // ACL event - ban denied servers
      if (!content["deny"]) continue;
      for (const server of content["deny"]) {
        const reason = "<no reason>";
        const result = await policyRoomEditor.ok.banEntity(
          PolicyRuleType.Server,
          server,
          reason
        );
        if (isError(result)) {
          errors.push(
            RoomActionError.fromActionError(policyRoom.ok, result.error)
          );
        }
      }
    }
  }
  return MultipleErrors.Result(
    `There were multiple errors when importing bans from the room ${importFromRoomReference.toPermalink()} to ${policyRoomReference.toPermalink()}`,
    { errors }
  );
}

defineInterfaceCommand<DraupnirBaseExecutor>({
  designator: ["import"],
  table: "draupnir",
  parameters: parameters([
    {
      name: "import from room",
      acceptor: findPresentationType("MatrixRoomReference"),
    },
    {
      name: "policy room",
      acceptor: findPresentationType("MatrixRoomReference"),
    },
  ]),
  command: importCommand,
  summary:
    "Import user and server bans from a Matrix room and add them to a policy room.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "import"),
  renderer: tickCrossRenderer,
});
