import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupHouses } from '../components/common/houseGroups';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { WorksPage } from './WorksPage';

it('показывает только spinner во время загрузки', () => {
  const html = renderToStaticMarkup(<LoadingSpinner />);
  expect(html).toContain('role="status"');
  expect(html).not.toContain('Загрузка...');
  expect(html).not.toContain('Загрузка пользователей');
});

it('показывает центрированные error и empty с повтором', () => {
  const error = renderToStaticMarkup(<ErrorState message="Сеть недоступна" onRetry={() => {}} />);
  expect(error).toContain('panel-state--error');
  expect(error).toContain('Повторить');
  const empty = renderToStaticMarkup(<EmptyState message="Дома не найдены" detail="Попробуйте изменить запрос" />);
  expect(empty).toContain('panel-state--empty');
  expect(empty).toContain('Дома не найдены');
});

it('группирует дома по доступу без пустых секций', () => {
  const houses = ['NONE', 'PENDING', 'ACTIVE', 'REJECTED'].map((status, index) => ({ id: index + 1, access: { status } }));
  expect(groupHouses(houses).map(([title, items]) => [title, items.map((item) => item.id)])).toEqual([
    ['Ваши дома', [3]], ['Ваши заявки', [2]], ['Другие дома', [1, 4]],
  ]);
  expect(groupHouses([])).toEqual([]);
});

it('без активного дома скрывает сообщение о проблеме и показывает подсказку', () => {
  const html = renderToStaticMarkup(<WorksPage houseId={null} canCreateObservation={false} onBack={() => {}} onOpenReport={() => {}} />);
  expect(html).not.toContain('Сообщить о проблеме');
  expect(html).toContain('Сначала выберите дом');
  expect(html).toContain('После выбора дома здесь появятся его события.');
  expect(html).not.toContain('<select');
});
