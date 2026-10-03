-- notify schedule on catalog edits: renaming an instructor or a class type
-- changes the name every scheduled class shows, so each upcoming class is
-- re-sent to open schedule pages.

create or replace function catalogNotifySchedule()
returns trigger
language plpgsql
as $$
declare
  s record;
begin
  for s in
    select id from classSessions
     where (classTypeId = new.id or instructorId = new.id)
       and startsAt >= now() - interval '1 day'
  loop
    perform notifyLive('schedule', 'update', s.id);
  end loop;

  return new;
end;
$$;

create trigger instructorsNotifySchedule
  after update on instructors
  for each row execute function catalogNotifySchedule();

create trigger classTypesNotifySchedule
  after update on classTypes
  for each row execute function catalogNotifySchedule();
