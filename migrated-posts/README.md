# Staging area, delete when empty

The six posts that used to live as MDX in `src/content/blog/`, converted into the
format the admin editor's **Paste a draft** box reads.

They are committed for one reason: the MDX source was deleted along with the
build-time pipeline, so until these are imported into Firestore, **this folder is
the only copy of the writing**.

## What to do with them

For each `.txt` file:

1. Open [merid.site/admin/blog](https://merid.site/admin/blog) → **New post**
2. Paste the whole file into **Paste a draft** → **Fill the form**
3. Check it over, add a cover image
4. **Save draft**, or **Publish** for the two marked below

## Which to publish

These two were live under the old system, so they should go straight to Published:

- `vie__toucan-co-ho-tro-tieng-viet-khong.txt`
- `en__toucan-vietnamese-support.txt`

The other four should land as drafts. They still carry `TODO_STAT` markers that
need resolving before they are worth publishing — the Toucan language list needs a
first-party citation, and the vocabulary-coverage post has a deliberately blank
statistic that needs a real source.

## Then

Delete this whole folder and `scripts/migrate-posts.mjs`. Keeping a second way to
create posts around only invites someone to use it instead of the admin.
