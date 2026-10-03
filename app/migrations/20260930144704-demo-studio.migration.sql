-- demo studio: the staff login, three instructors, a week of classes from
-- today, eight members on packs and memberships, their bookings, and a full
-- Reformer class with a waitlist. Every login's password is "packpass",
-- and the sign-in page lists them all.
/** @env development */

insert into users (email, name, passwordHash, role, credits)
     values ('staff@packpass.test',  'Studio Staff',  crypt('packpass', genSalt('bf', 10)), 'staff',  0),
            ('maya@packpass.test',   'Maya Chen',     crypt('packpass', genSalt('bf', 10)), 'member', 0),
            ('jordan@packpass.test', 'Jordan Ellis',  crypt('packpass', genSalt('bf', 10)), 'member', 7),
            ('priya@packpass.test',  'Priya Raman',   crypt('packpass', genSalt('bf', 10)), 'member', 2),
            ('sam@packpass.test',    'Sam Okafor',    crypt('packpass', genSalt('bf', 10)), 'member', 0),
            ('lena@packpass.test',   'Lena Fischer',  crypt('packpass', genSalt('bf', 10)), 'member', 8),
            ('diego@packpass.test',  'Diego Alvarez', crypt('packpass', genSalt('bf', 10)), 'member', 1),
            ('hannah@packpass.test', 'Hannah Park',   crypt('packpass', genSalt('bf', 10)), 'member', 0),
            ('theo@packpass.test',   'Theo Brooks',   crypt('packpass', genSalt('bf', 10)), 'member', 0);

-- Members joined over the last few months, not all on the day of the seed.
update users u
   set createdAt = now() - j.ago
  from (values ('staff@packpass.test',  interval '200 days'),
               ('maya@packpass.test',   interval '142 days'),
               ('jordan@packpass.test', interval '96 days'),
               ('priya@packpass.test',  interval '61 days'),
               ('sam@packpass.test',    interval '118 days'),
               ('lena@packpass.test',   interval '23 days'),
               ('diego@packpass.test',  interval '74 days'),
               ('hannah@packpass.test', interval '167 days'),
               ('theo@packpass.test',   interval '45 days'))
       as j (email, ago)
 where u.email = j.email;

insert into memberships (userId, status, currentPeriodEnd, cancelAtPeriodEnd)
     select id, 'active', now() + interval '18 days', false from users where email = 'maya@packpass.test'
      union all
     select id, 'active', now() + interval '6 days', true from users where email = 'sam@packpass.test'
      union all
     select id, 'active', now() + interval '25 days', false from users where email = 'hannah@packpass.test';

insert into payments (stripeSessionId, userId, product, credits, amountTotal, currency, createdAt)
     select 'seed_' || u.email, u.id, p.product, p.credits, p.amount, 'usd', now() - p.ago
       from (values ('jordan@packpass.test', 'pack10', 10, 19000, interval '12 days'),
                    ('priya@packpass.test',  'pack5',   5, 10500, interval '9 days'),
                    ('lena@packpass.test',   'pack10', 10, 19000, interval '3 days'),
                    ('diego@packpass.test',  'pack5',   5, 10500, interval '20 days'),
                    ('theo@packpass.test',   'pack5',   5, 10500, interval '30 days'))
            as p (email, product, credits, amount, ago)
       join users u on u.email = p.email;

insert into instructors (name, specialty, bio)
     values ('Ana Silva',    'Vinyasa and Yin',  'Ana teaches breath-led flow and long, quiet holds. Twelve years on the mat.'),
            ('Marcus Lee',   'Reformer Pilates', 'Marcus is a former dancer who coaches precise, strong Reformer work.'),
            ('Rosa Delgado', 'Mat Pilates and Hatha', 'Rosa builds classes around alignment, core strength and steady pacing.');

insert into classTypes (name, kind, description, durationMinutes, capacity)
     values ('Vinyasa Flow',     'yoga',    'A steady, breath-linked flow that builds heat.', 60, 14),
            ('Yin Yoga',         'yoga',    'Long floor holds for the hips, spine and nervous system.', 75, 12),
            ('Hatha Basics',     'yoga',    'Foundational postures, taught slowly with lots of cues.', 60, 14),
            ('Mat Pilates',      'pilates', 'Classic mat repertoire for core strength and control.', 50, 12),
            ('Reformer Pilates', 'pilates', 'Spring resistance on the Reformer. Small group, all levels.', 50, 6);

-- The timetable: the same five slots on weekdays, three on weekends, for the
-- seven days starting today in the studio's time zone.
insert into classSessions (classTypeId, instructorId, startsAt, durationMinutes, capacity, room)
     select t.id,
            i.id,
            ((date_trunc('day', now() at time zone 'America/Los_Angeles') + d.day * interval '1 day' + s.at)
              at time zone 'America/Los_Angeles'),
            t.durationMinutes,
            t.capacity,
            s.room
       from generate_series(0, 6) as d (day)
       join (values ('07:00'::interval, 'Vinyasa Flow',     'Ana Silva',    'Studio A', false),
                    ('09:30'::interval, 'Reformer Pilates', 'Marcus Lee',   'Reformer Room', false),
                    ('12:15'::interval, 'Mat Pilates',      'Rosa Delgado', 'Studio B', false),
                    ('17:30'::interval, 'Hatha Basics',     'Rosa Delgado', 'Studio A', false),
                    ('19:00'::interval, 'Yin Yoga',         'Ana Silva',    'Studio A', false),
                    ('08:30'::interval, 'Vinyasa Flow',     'Ana Silva',    'Studio A', true),
                    ('10:00'::interval, 'Reformer Pilates', 'Marcus Lee',   'Reformer Room', true),
                    ('11:30'::interval, 'Yin Yoga',         'Rosa Delgado', 'Studio B', true))
            as s (at, className, instructorName, room, weekend)
         on s.weekend = (extract(isodow from (date_trunc('day', now() at time zone 'America/Los_Angeles') + d.day * interval '1 day')) in (6, 7))
       join classTypes t on t.name = s.className
       join instructors i on i.name = s.instructorName;

-- Tomorrow morning's Reformer class is the full one: five spots, all taken,
-- two members waiting.
update classSessions set capacity = 5
 where id = (select id from classSessions
              where startsAt >= date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles' + interval '1 day'
                and room = 'Reformer Room'
              order by startsAt
              limit 1);

create temporary table seedBookings (email text, dayOffset integer, slot integer, status bookingStatus, checkedIn boolean);

-- slot is the class's place in that day's timetable, from 1.
insert into seedBookings (email, dayOffset, slot, status, checkedIn)
     values ('maya@packpass.test',   0, 1, 'booked', true),
            ('jordan@packpass.test', 0, 1, 'booked', true),
            ('lena@packpass.test',   0, 1, 'booked', false),
            ('hannah@packpass.test', 0, 2, 'booked', true),
            ('sam@packpass.test',    0, 2, 'booked', true),
            ('priya@packpass.test',  0, 3, 'booked', true),
            ('maya@packpass.test',   0, 4, 'booked', false),
            ('diego@packpass.test',  0, 4, 'booked', false),
            ('theo@packpass.test',   0, 4, 'booked', false),
            ('jordan@packpass.test', 0, 5, 'booked', false),
            ('hannah@packpass.test', 0, 5, 'booked', false),
            ('maya@packpass.test',   1, 2, 'booked', false),
            ('jordan@packpass.test', 1, 2, 'booked', false),
            ('priya@packpass.test',  1, 2, 'booked', false),
            ('sam@packpass.test',    1, 2, 'booked', false),
            ('hannah@packpass.test', 1, 2, 'booked', false),
            ('lena@packpass.test',   1, 2, 'waitlisted', false),
            ('diego@packpass.test',  1, 2, 'waitlisted', false),
            ('lena@packpass.test',   1, 1, 'booked', false),
            ('maya@packpass.test',   2, 1, 'booked', false),
            ('sam@packpass.test',    2, 3, 'booked', false),
            ('lena@packpass.test',   2, 5, 'booked', false),
            ('hannah@packpass.test', 3, 1, 'booked', false),
            ('jordan@packpass.test', 3, 2, 'booked', false),
            ('maya@packpass.test',   4, 2, 'booked', false),
            ('hannah@packpass.test', 5, 1, 'booked', false),
            ('maya@packpass.test',   1, 1, 'booked', false),
            ('hannah@packpass.test', 1, 1, 'booked', false),
            ('sam@packpass.test',    1, 1, 'booked', false),
            ('jordan@packpass.test', 1, 1, 'booked', false),
            ('priya@packpass.test',  1, 3, 'booked', false),
            ('sam@packpass.test',    1, 3, 'booked', false),
            ('hannah@packpass.test', 1, 3, 'booked', false),
            ('maya@packpass.test',   1, 3, 'booked', false),
            ('jordan@packpass.test', 1, 3, 'booked', false),
            ('lena@packpass.test',   1, 3, 'booked', false),
            ('diego@packpass.test',  1, 3, 'booked', false),
            ('maya@packpass.test',   1, 4, 'booked', false),
            ('lena@packpass.test',   1, 4, 'booked', false),
            ('hannah@packpass.test', 1, 4, 'booked', false),
            ('jordan@packpass.test', 1, 5, 'booked', false),
            ('sam@packpass.test',    1, 5, 'booked', false),
            ('hannah@packpass.test', 1, 5, 'booked', false),
            ('maya@packpass.test',   1, 5, 'booked', false),
            ('priya@packpass.test',  1, 5, 'booked', false),
            ('lena@packpass.test',   1, 5, 'booked', false),
            ('hannah@packpass.test', 2, 1, 'booked', false),
            ('jordan@packpass.test', 2, 1, 'booked', false),
            ('maya@packpass.test',   2, 2, 'booked', false),
            ('hannah@packpass.test', 2, 2, 'booked', false),
            ('sam@packpass.test',    2, 2, 'booked', false),
            ('maya@packpass.test',   2, 4, 'booked', false),
            ('lena@packpass.test',   2, 4, 'booked', false),
            ('hannah@packpass.test', 2, 5, 'booked', false),
            ('sam@packpass.test',    2, 5, 'booked', false);

insert into bookings (sessionId, userId, status, usedCredit, waitlistedAt, checkedInAt, createdAt)
     select s.id,
            u.id,
            b.status,
            b.status = 'booked' and m.id is null,
            case when b.status = 'waitlisted' then now() - interval '1 hour' + row_number() over (order by b.email) * interval '1 minute' end,
            case when b.checkedIn then s.startsAt - interval '5 minutes' end,
            now() - interval '2 days'
       from seedBookings b
       join users u on u.email = b.email
       left join memberships m on m.userId = u.id
       join lateral (
              select cs.id, cs.startsAt
                from classSessions cs
               where cs.startsAt >= (date_trunc('day', now() at time zone 'America/Los_Angeles') + b.dayOffset * interval '1 day') at time zone 'America/Los_Angeles'
                 and cs.startsAt <  (date_trunc('day', now() at time zone 'America/Los_Angeles') + (b.dayOffset + 1) * interval '1 day') at time zone 'America/Los_Angeles'
               order by cs.startsAt
              offset b.slot - 1
               limit 1
            ) s on true;

-- Classes that have already happened do not get a reminder.
update bookings b
   set reminderSentAt = s.startsAt - interval '2 hours'
  from classSessions s
 where s.id = b.sessionId and s.startsAt < now() + interval '2 hours';

drop table seedBookings;
