# Long Scroll

A shared scroll. Anyone who visits can add one stroke of ink to it &mdash; a
colour, and an optional short note. Nothing on it is ever edited or removed.
Visit again and your own strokes are still there, marked as yours. Keep the
page open and other people's strokes arrive as they make them; press _Hear
the scroll_ and the same strokes play back as a slow, quiet piece of music.

## What good means here, for now

This is the second version of an argument I expect to keep rewriting. Right
now it says: **good, at this size, means small enough that everyone's mark is
still legible, durable enough that coming back is worth it, and present
enough that you can tell other hands are on it with you.**

I take my definition of "small enough" from writing about software built for
a handful of people rather than a market. Robin Sloan's
[_An App Can Be a Home-Cooked Meal_](https://www.robinsloan.com/notes/home-cooked-app/)
argues that an app made for people you actually know can skip almost
everything a product needs; his
[five-year follow-up](https://www.robinsloan.com/lab/five-years-of-home-cooked-apps/)
adds that the property worth protecting longest is sovereignty: who the app
answers to. Ben Hoyt's
[_The small web is beautiful_](https://benhoyt.com/writings/the-small-web-is-beautiful/)
makes the same case from the stack down &mdash; fewer moving parts is most of
why small software stays legible. Maggie Appleton's
[_Home-Cooked Software and Barefoot Developers_](https://maggieappleton.com/home-cooked-software)
extends Sloan's essay into a claim I want this scroll to test: the software
worth making for a small group is the software the group could not buy,
because nobody else needs exactly this.

A scroll fits that brief oddly well. It has no feed, no ranking, no
expiring anything: everyone who has ever added a stroke is still legible in
it, in the order they arrived, the way a real scroll accumulates hands over
years rather than resetting each session.

The three additions in this version are all ways of feeling that the object
is shared, not ways of turning it into a channel. **Live arrival**: a stroke
someone adds lands on every open page within a moment, in its place at the
end of the scroll, without a reload. **Anonymous presence**: the page says
how many distinct hands have it open right now &mdash; a number, nothing
else; two tabs in one browser are one hand. **Hearing the scroll**: each of
the six inks has its own fixed pitch, so the colour sequence the scroll
already stores can be played back, oldest stroke first, as a slow pentatonic
piece; while you listen, a stroke from another hand sounds once as it lands.
None of the three stores anything new. Arrival is the same row everyone's
next load would have read; presence is held in memory only while a page is
open, and forgotten the moment it closes; the music is computed in your own
browser from colours that were already on the scroll.

That is why the scroll is still not a feed, a chat, a ranking or a social
network. A feed reorders and forgets; this only ever appends, in arrival
order, and keeps everything. A chat is addressed to someone and invites a
reply; a stroke is addressed to the scroll, and there is no reply, no thread
and no way to point at another hand's mark. A ranking needs something to
count per stroke; there are no likes, no views, nothing that makes one
stroke outrank another. And a social network needs identities to connect;
there are none here &mdash; no name, no profile, no list of who is present,
only a count. One small shared object, with other people quietly at the
other end of it.

**What I chose not to build, this week:** accounts (a browser is a person,
distinguished by an anonymous cookie, nothing more); editing or deleting a
stroke once added (the scroll is append-only, on purpose &mdash; that's a
claim, not an oversight); any view of _who_ is present (presence is a count,
with no names, avatars, lists or history, because a list of visitors is the
first step towards a social graph); replies, reactions or anything else that
lets one stroke address another; sound that starts on its own (the music
plays only after you press the button, and stops when you ask); any limit on
how many strokes one hand can add (a guestbook you can only sign once is a
worse guestbook).

## What's enforced and what's judged

Enforced, in `spec/`: a stroke's colour must be one of the six the form
offers (never an arbitrary string), a note is capped at 140 characters
server-side (not just by the input's `maxlength`), a returning hand's
past strokes are still in the response after a fresh server restart, no
method, from any hand, edits or deletes a stroke once it's stored, the page
tells you in text (not just ink) which strokes are yours, every control
on it is a native, labelled form element in the tab order, a new stroke
reaches an open stream, no response or stream event ever carries a browser's
internal `hand` (ownership travels only as a per-reader `yours: true` or
`false`), and presence counts distinct hands, not open connections.

Judged, by a visitor reading this page: whether the scroll reads as one
continuous, shared object rather than a list of comments; whether finding
your own old stroke feels like the point, not an afterthought; whether
six ink colours and a 140-character note are enough constraint to keep this
feeling like a scroll and not a chat log; and whether hearing it, and
hearing another hand arrive, makes the other people on it feel nearer
without making the page louder than the scroll.

## Multi-user, for now

A person is whoever's browser holds a given anonymous `hand` cookie &mdash;
no account, no name required. Everyone sees the same scroll; there is no
private view. Every open page holds a read-only server-sent events stream
(`/api/stream`); once a stroke is stored, the server pushes it down every
open stream, each copy marked `yours: true` only for the connections whose
cookie made it. Writes still go only through the same-origin `POST` to
`/api/marks`; the stream accepts nothing. If the stream drops &mdash; a lost
connection, or this app's one machine stopping when idle and starting again
on the next request &mdash; the page reconnects by itself and fetches the
scroll again, so a stroke made while it was away still appears.

Presence is bookkeeping kept only in the server's memory: each open stream
is filed under its hand, and the count is the number of hands with at least
one stream open. Closing the last tab for a hand takes it off the count.
The `hand` itself never leaves the server, in any response or event.

The broadcast is in-process, which is enough because the app runs on exactly
one Fly machine. That is a real limitation, not a detail: a second machine
would have its own separate set of streams, and a stroke stored on one would
never reach pages connected to the other, so a multi-machine deployment
would need shared pub/sub (or an equivalent way to coordinate) before it
could keep this promise.
