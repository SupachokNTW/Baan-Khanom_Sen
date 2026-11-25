-- PLACEHOLDER menu and prices — replace once the family confirms them.
-- Run after migrations/001_init.sql.

insert into public.option_groups (name, min_select, max_select, sort_order, kitchen_tally) values
  ('น้ำยา',     1, 1, 1, true),
  ('ขนาด',      1, 1, 2, false),
  ('เพิ่มเติม', 0, 3, 3, false),
  ('ความหวาน',  1, 1, 4, false);

insert into public.options (group_id, name, price_delta, sort_order)
select g.id, o.name, o.delta, o.ord
  from (values
    ('น้ำยา', 'น้ำยากะทิ', 0, 1),
    ('น้ำยา', 'น้ำยาป่า', 0, 2),
    ('น้ำยา', 'แกงเขียวหวานไก่', 0, 3),
    ('น้ำยา', 'น้ำพริก', 0, 4),
    ('น้ำยา', 'แกงไตปลา', 10, 5),
    ('ขนาด', 'ธรรมดา', 0, 1),
    ('ขนาด', 'พิเศษ', 15, 2),
    ('เพิ่มเติม', 'ไข่ต้ม', 10, 1),
    ('เพิ่มเติม', 'เส้นเพิ่ม', 10, 2),
    ('เพิ่มเติม', 'ลูกชิ้นปลา', 15, 3),
    ('ความหวาน', 'หวานปกติ', 0, 1),
    ('ความหวาน', 'หวานน้อย', 0, 2),
    ('ความหวาน', 'ไม่หวาน', 0, 3)
  ) as o(grp, name, delta, ord)
  join public.option_groups g on g.name = o.grp;

insert into public.menu_items (name, description, price, category, sort_order) values
  ('ขนมจีน',          'เลือกน้ำยาได้ 1 อย่าง พร้อมผักเครื่องเคียง', 45, 'noodle', 1),
  ('ทอดมันปลากราย',   '5 ชิ้น พร้อมน้ำจิ้ม',                    50, 'side',   10),
  ('ไข่ต้ม',           '1 ฟอง',                                 10, 'side',   11),
  ('ผักเครื่องเคียงเพิ่ม', 'ถั่วงอก ถั่วฝักยาว แตงกวา ผักบุ้ง',      15, 'side',   12),
  ('ชาเย็น',           '',                                      25, 'drink',  20),
  ('น้ำอัญชันมะนาว',    '',                                      25, 'drink',  21),
  ('น้ำเปล่า',         'ขวดเล็ก',                                10, 'drink',  22);

insert into public.menu_item_option_groups (menu_item_id, group_id, sort_order)
select m.id, g.id, g.sort_order
  from public.menu_items m join public.option_groups g on g.name in ('น้ำยา', 'ขนาด', 'เพิ่มเติม')
 where m.name = 'ขนมจีน';

insert into public.menu_item_option_groups (menu_item_id, group_id, sort_order)
select m.id, g.id, 1
  from public.menu_items m join public.option_groups g on g.name = 'ความหวาน'
 where m.name in ('ชาเย็น', 'น้ำอัญชันมะนาว');

insert into public.tables (label)
select i::text from generate_series(1, 10) i;
