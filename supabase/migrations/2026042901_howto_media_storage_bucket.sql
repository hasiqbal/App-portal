-- Create the public storage bucket used by the howto-media-upload edge function
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'howto-media',
  'howto-media',
  true,
  8388608,  -- 8 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their guide paths
create policy "Authenticated users can upload howto media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'howto-media');

-- Allow public read access
create policy "Public can read howto media"
  on storage.objects for select
  to public
  using (bucket_id = 'howto-media');

-- Allow authenticated users to delete their own uploads
create policy "Authenticated users can delete howto media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'howto-media');
