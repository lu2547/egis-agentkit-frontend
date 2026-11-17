import { expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  useSteeringQueue,
  clearSteeringQueues,
} from "../src/composables/useSteeringQueue";

it("clears pending private drafts when the signed-in identity is cleared", () => {
  const queue = useSteeringQueue(ref(crypto.randomUUID()), ref(20), vi.fn());
  queue.add("私人项目的补充要求");
  clearSteeringQueues();
  expect(queue.items.value).toEqual([]);
});

it("queues multiple messages, edits, deletes and reorders without mixing sessions", () => {
  const sid = ref(crypto.randomUUID());
  const original = sid.value;
  const queue = useSteeringQueue(sid, ref(20), vi.fn());
  queue.add("预算");
  queue.add("配色");
  queue.add("保留原文");
  const [first, second, third] = queue.items.value;
  queue.edit(second!.message.id, "配色改为蓝色");
  queue.move(third!.message.id, 0);
  queue.remove(first!.message.id);
  expect(queue.items.value.map((item) => item.text)).toEqual([
    "保留原文",
    "配色改为蓝色",
  ]);
  sid.value = crypto.randomUUID();
  expect(queue.items.value).toEqual([]);
  queue.add("另一个会话");
  sid.value = original;
  expect(queue.items.value).toHaveLength(2);
});

it("retains failed messages and their IDs, then removes only the acknowledged batch", async () => {
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const queue = useSteeringQueue(ref(crypto.randomUUID()), ref(20), send);
  queue.add("一");
  queue.add("二");
  queue.add("三");
  const ids = queue.items.value.map((item) => item.message.id);
  expect(await queue.send(ids)).toBe(false);
  expect(queue.items.value.map((item) => item.message.id)).toEqual(ids);
  expect(await queue.send(ids.slice(0, 2))).toBe(true);
  expect(send.mock.calls[1]![0].map((m: { id: string }) => m.id)).toEqual(
    ids.slice(0, 2),
  );
  expect(queue.items.value.map((item) => item.text)).toEqual(["三"]);
});

it("keeps a completed send scoped to the original session", async () => {
  let finish!: (accepted: boolean) => void;
  const sid = ref(crypto.randomUUID());
  const firstSession = sid.value;
  const queue = useSteeringQueue(
    sid,
    ref(20),
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  queue.add("第一会话");
  const sending = queue.send(queue.items.value.map((item) => item.message.id));
  sid.value = crypto.randomUUID();
  queue.add("第二会话");
  finish(true);
  await sending;
  expect(queue.items.value.map((item) => item.text)).toEqual(["第二会话"]);
  sid.value = firstSession;
  expect(queue.items.value).toEqual([]);
});

it("serializes consecutive immediate sends instead of leaving the second unsent", async () => {
  let finish!: (accepted: boolean) => void;
  const sent: string[] = [];
  const queue = useSteeringQueue(
    ref(crypto.randomUUID()),
    ref(20),
    async (messages) => {
      sent.push(messages[0]!.id);
      if (sent.length === 1)
        return new Promise<boolean>((resolve) => {
          finish = resolve;
        });
      return true;
    },
  );
  queue.add("一");
  const first = queue.send([queue.items.value[0]!.message.id]);
  queue.add("二");
  const second = queue.send([queue.items.value[1]!.message.id]);
  await Promise.resolve();
  finish(true);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(sent).toHaveLength(2);
  expect(queue.items.value).toEqual([]);
});
