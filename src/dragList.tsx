import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { Icon, C } from './ui';

interface Handlers {
  begin: (id: string) => void;
  move: (id: string, dy: number) => void;
  end: () => void;
}

/** One row. Its grip is the only part that starts a drag, so tapping the row still works. */
function Row<T>({ item, id, index, top, height, active, dy, handlers, renderItem }: {
  item: T;
  id: string;
  index: number;
  top: number;
  height: number;
  active: boolean;
  dy: Animated.Value;
  handlers: React.MutableRefObject<Handlers>;
  renderItem: (item: T, index: number, grip: ReactNode) => ReactNode;
}) {
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => handlers.current.begin(id),
      onPanResponderMove: (_, g) => handlers.current.move(id, g.dy),
      onPanResponderRelease: () => handlers.current.end(),
      onPanResponderTerminate: () => handlers.current.end(),
    }),
  ).current;

  const grip = (
    <View {...pan.panHandlers} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 44, height, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="grip" size={22} color={C.muted} stroke={3} />
    </View>
  );

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        height,
        zIndex: active ? 10 : 0,
        backgroundColor: active ? C.brandSoft : '#fff',
        elevation: active ? 6 : 0,
        transform: active ? [{ translateY: dy }] : [],
      }}
    >
      {renderItem(item, index, grip)}
    </Animated.View>
  );
}

/**
 * A list whose rows can be dragged up and down by their grip. Rows must all be `height` tall.
 * `onReorder` gets the new order of keys when the finger lifts.
 */
export function DragList<T>({ items, keyOf, height, renderItem, onReorder }: {
  items: T[];
  keyOf: (item: T) => string;
  height: number;
  renderItem: (item: T, index: number, grip: ReactNode) => ReactNode;
  onReorder: (keys: string[]) => void;
}) {
  const [live, setLive] = useState<T[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const startIndex = useRef(0);
  const current = useRef<T[]>(items);
  const list = live ?? items;

  const handlers = useRef<Handlers>({ begin: () => {}, move: () => {}, end: () => {} });
  handlers.current = {
    begin: (id) => {
      current.current = list;
      startIndex.current = list.findIndex((x) => keyOf(x) === id);
      dy.setValue(0);
      setLive(list);
      setActive(id);
    },
    move: (id, d) => {
      const n = current.current.length;
      const target = Math.max(0, Math.min(n - 1, Math.round((startIndex.current * height + d) / height)));
      const from = current.current.findIndex((x) => keyOf(x) === id);
      if (target !== from) {
        const next = [...current.current];
        const [it] = next.splice(from, 1);
        next.splice(target, 0, it);
        current.current = next;
        setLive(next);
      }
      dy.setValue(startIndex.current * height + d - target * height);
    },
    end: () => {
      const keys = current.current.map(keyOf);
      const changed = keys.join() !== items.map(keyOf).join();
      setActive(null);
      dy.setValue(0);
      if (changed) onReorder(keys);
      else setLive(null);
    },
  };

  // Keep showing the dragged order until the saved order catches up, so the list never flickers back.
  useEffect(() => {
    if (live && active === null && live.map(keyOf).join() === items.map(keyOf).join()) setLive(null);
  });

  return (
    <View style={{ height: list.length * height }}>
      {list.map((item, i) => {
        const id = keyOf(item);
        return <Row key={id} item={item} id={id} index={i} top={i * height} height={height} active={active === id} dy={dy} handlers={handlers} renderItem={renderItem} />;
      })}
    </View>
  );
}
