const ENTITY_LABELS = {
  candidate: "日程",
  participant: "参加者",
  response: "回答",
  share: "共有URL"
};

const ACTION_LABELS = {
  add: "の追加",
  update: "の更新",
  remove: "の削除",
  upsert: "の保存",
  rotate: "の再発行",
  invalidate: "の無効化"
};

const describeMutationToast = (event = {}) => {
  const entityLabel = ENTITY_LABELS[event.entity] || "操作";
  const actionLabel = ACTION_LABELS[event.action] || "の更新";
  if (event.phase === "conflict") {
    return `${entityLabel}${actionLabel}が他の変更と競合したため、画面を最新の状態に戻しました。再度お試しください。`;
  }
  if (event.phase === "error") {
    return `${entityLabel}${actionLabel}に失敗しました。時間をおいて再度お試しください。`;
  }
  return "";
};

module.exports = {
  describeMutationToast
};
