# revview
Provides public access to post revisions using the WordPress REST API. Requires the latest version 2.0 under development at https://github.com/WP-API/WP-API

##Endpoints
The plugin adds two endpoints to display, for a given entry and provided that its post type is visible for REST, all revisions or a single revision:


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/public/
```
returns all revisions of a post


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/public/(?P<revision_id>[\d]+)
```
returns a single revision of a post


```js
wp-json/revview/v1/posts/(?P<parent_id>[\d]+)/revisions/public/(?P<revision_id>[\d]+)
```
returns a list of objects for all revisions containing revision ID, author name and date.

The JSON object returned includes the title, content, excerpt and revision date, among other data.

##Example
As a simple example, in a singular view, it will display the date and author of all revisions. Further info can be seen in JS console. If revision is clicked, console will display the update.
