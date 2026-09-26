import { Icon16SearchOutline, Input } from '@maxhub/max-ui';

export function SearchInput(props) {
  return <Input iconBefore={<Icon16SearchOutline />} inputMode="search" size="medium" withClearButton {...props} />;
}
