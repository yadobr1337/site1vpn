"use client";

import { useActionState } from "react";
import {
  createSquadAction,
  deleteSquadAction,
  updateSquadLimitAction,
  type SquadActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

type SquadItem = {
  id: string;
  name: string;
  memberLimit: number;
  isActive: boolean;
  remnawaveInternalSquadUuid: string | null;
  userCount: number;
};

const initialState: SquadActionState = {
  status: "idle",
  message: "",
};

function ActionMessage({ state }: { state: SquadActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}
    >
      {state.message}
    </p>
  );
}

function SquadRow({ squad }: { squad: SquadItem }) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateSquadLimitAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSquadAction, initialState);

  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <form action={updateAction} className="grid gap-3 xl:grid-cols-[1fr_1.2fr_160px_auto_auto]">
        <input type="hidden" name="squadId" value={squad.id} />
        <input
          className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          defaultValue={squad.name}
          name="name"
          placeholder="Название"
        />
        <input
          className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          defaultValue={squad.remnawaveInternalSquadUuid ?? ""}
          name="remnawaveInternalSquadUuid"
          placeholder="UUID сквада"
          required
        />
        <input
          className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          defaultValue={squad.memberLimit}
          min="1"
          name="memberLimit"
          type="number"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input defaultChecked={squad.isActive} name="isActive" type="checkbox" />
          active
        </label>
        <Button type="submit" variant="ghost" disabled={updatePending || deletePending}>
          {updatePending ? "Проверяем..." : "Обновить"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Занято {squad.userCount} из {squad.memberLimit} мест
        </p>
        <form action={deleteAction}>
          <input type="hidden" name="squadId" value={squad.id} />
          <Button type="submit" variant="danger" disabled={deletePending || updatePending}>
            {deletePending ? "Удаляем..." : "Удалить"}
          </Button>
        </form>
      </div>

      <div className="mt-3 space-y-2">
        <ActionMessage state={updateState} />
        <ActionMessage state={deleteState} />
      </div>
    </div>
  );
}

export function SquadManager({ squads }: { squads: SquadItem[] }) {
  const [createState, createAction, createPending] = useActionState(createSquadAction, initialState);

  return (
    <>
      <form action={createAction} className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1fr_180px_auto]">
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          name="remnawaveInternalSquadUuid"
          placeholder="UUID сквада Remnawave"
          required
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          name="name"
          placeholder="Название для админки"
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
          min="1"
          name="memberLimit"
          placeholder="Лимит"
          required
          type="number"
        />
        <Button type="submit" disabled={createPending}>
          {createPending ? "Проверяем..." : "Добавить сквад"}
        </Button>
      </form>
      <div className="mt-3">
        <ActionMessage state={createState} />
      </div>

      <div className="mt-6 space-y-3">
        {squads.length ? (
          squads.map((squad) => <SquadRow key={squad.id} squad={squad} />)
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
            Сквады ещё не добавлены. Пользователи будут ожидать назначения в свободный сквад.
          </div>
        )}
      </div>
    </>
  );
}
