# revview
Provides public access to post revisions using the WordPress REST API.

## Endpoints
The plugin adds two endpoints to display, for a given entry and provided that its post type is visible for REST, all revisions or a single revision:


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/
```
returns all revisions of a post specified by parent_id parameter


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/(?P<revision_id>[\d]+)
```
returns a single revision of a post specified by revision_id parameter


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/ids
```
returns a list of objects for all revisions containing revision ID, author name and date.

The JSON object returned includes the title, content, excerpt and revision date, among other data.

## Usage
1. Download Revview plugin https://github.com/eliorivero/revview/archive/master.zip

2. Install and activate.

3. If you now go to the front end view of a post or page that has revisions, you'll see a button **View Revisions** at the top. Click it to start viewing the revisions of the post, page or custom post type if it's visible in REST API.

The placement of the **View Revisions** button can be changed in WP Admin > Settings > Reading.
