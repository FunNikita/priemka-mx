import { Counter } from '@maxhub/max-ui';
import { Icon24LikeOutline, Icon24CancelOutline } from '@vkontakte/icons';
import { useState } from 'react';

// Оценка идеи, перенесённая по паттерну IdeasPanel.
export function IdeaVoteButtons() {
  const [vote, setVote] = useState(0);
  const likes = 12 + (vote === 1 ? 1 : 0);
  const dislikes = 2 + (vote === -1 ? 1 : 0);
  return <div className="idea-votes"><button type="button" className={vote === 1 ? 'idea-votes__button idea-votes__button--active' : 'idea-votes__button'} onClick={() => setVote(vote === 1 ? 0 : 1)}><Icon24LikeOutline /><Counter value={likes} appearance="themed" /></button><button type="button" className={vote === -1 ? 'idea-votes__button idea-votes__button--active idea-votes__button--negative' : 'idea-votes__button'} onClick={() => setVote(vote === -1 ? 0 : -1)}><Icon24CancelOutline /><Counter value={dislikes} appearance="negative" /></button></div>;
}
