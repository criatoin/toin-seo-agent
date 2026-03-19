<?php
defined('ABSPATH') || exit;

class TOIN_SEO_REST_API {

    const NS = 'toin-seo/v1';

    public function register_routes(): void {
        $auth = [TOIN_SEO_Auth::class, 'permission_callback'];

        register_rest_route(self::NS, '/status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_status'],
            'permission_callback' => $auth,
        ]);

        register_rest_route(self::NS, '/pages', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_pages'],
            'permission_callback' => $auth,
        ]);

        register_rest_route(self::NS, '/pages/(?P<id>\d+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_page'],
            'permission_callback' => $auth,
            'args'                => [
                'id' => ['required' => true, 'validate_callback' => fn($v) => is_numeric($v)],
            ],
        ]);

        register_rest_route(self::NS, '/pages/(?P<id>\d+)/meta', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_meta'],
            'permission_callback' => $auth,
            'args'                => [
                'id' => ['required' => true, 'validate_callback' => fn($v) => is_numeric($v)],
            ],
        ]);

        register_rest_route(self::NS, '/pages/(?P<id>\d+)/schema', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_schema'],
            'permission_callback' => $auth,
            'args'                => [
                'id' => ['required' => true, 'validate_callback' => fn($v) => is_numeric($v)],
            ],
        ]);

        register_rest_route(self::NS, '/pages/(?P<id>\d+)/canonical', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_canonical'],
            'permission_callback' => $auth,
            'args'                => [
                'id' => ['required' => true, 'validate_callback' => fn($v) => is_numeric($v)],
            ],
        ]);

        register_rest_route(self::NS, '/pages/(?P<id>\d+)/images/alt', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_images_alt'],
            'permission_callback' => $auth,
            'args'                => [
                'id' => ['required' => true, 'validate_callback' => fn($v) => is_numeric($v)],
            ],
        ]);
    }

    // ── Handlers ────────────────────────────────────────────────────────────

    public function get_status(): WP_REST_Response {
        return new WP_REST_Response([
            'site_url'            => get_site_url(),
            'site_name'           => get_bloginfo('name'),
            'wp_version'          => get_bloginfo('version'),
            'seo_plugin_detected' => TOIN_SEO_Plugins::detect(),
            'plugin_active'       => true,
            'plugin_version'      => TOIN_SEO_VERSION,
        ]);
    }

    public function get_pages(): WP_REST_Response {
        // Include all public post types (custom post types like portfolio, services, team, etc.)
        $excluded   = ['attachment', 'revision', 'nav_menu_item', 'custom_css',
                       'customize_changeset', 'wp_global_styles', 'wp_template',
                       'wp_template_part', 'wp_navigation', 'wp_font_face', 'wp_font_family'];
        $post_types = array_values(array_filter(
            array_keys(get_post_types(['public' => true])),
            fn($pt) => !in_array($pt, $excluded)
        ));

        $seo_plugin = TOIN_SEO_Plugins::detect();
        $result     = [];
        $page       = 1;
        $per_page   = 500;

        // Paginate through ALL published posts (not just first 500)
        do {
            $posts = get_posts([
                'post_type'      => $post_types,
                'post_status'    => 'publish',
                'posts_per_page' => $per_page,
                'paged'          => $page,
                'fields'         => 'ids',
                'orderby'        => 'ID',
                'order'          => 'ASC',
            ]);

            foreach ($posts as $id) {
                $meta     = TOIN_SEO_Plugins::get_meta($id);
                $result[] = [
                    'id'          => $id,
                    'url'         => get_permalink($id),
                    'post_type'   => get_post_type($id),
                    'title'       => $meta['title'] ?: get_the_title($id),
                    'description' => $meta['description'],
                    'seo_plugin'  => $seo_plugin,
                ];
            }

            $page++;
        } while (count($posts) === $per_page);

        return new WP_REST_Response($result);
    }

    public function get_page(WP_REST_Request $request): WP_REST_Response {
        $id   = (int) $request['id'];
        $post = get_post($id);

        if (!$post || $post->post_status !== 'publish') {
            return new WP_REST_Response(['error' => 'Post not found or not published'], 404);
        }

        $meta      = TOIN_SEO_Plugins::get_meta($id);
        $canonical = (string) get_post_meta($id, '_toin_seo_canonical', true) ?: get_permalink($id);

        // Extract first H1 from content
        preg_match('/<h1[^>]*>(.*?)<\/h1>/si', $post->post_content, $h1_match);
        $h1 = isset($h1_match[1]) ? wp_strip_all_tags($h1_match[1]) : get_the_title($id);

        return new WP_REST_Response([
            'id'              => $id,
            'url'             => get_permalink($id),
            'post_type'       => $post->post_type,
            'title'           => $meta['title'] ?: get_the_title($id),
            'meta_desc'       => $meta['description'],
            'h1'              => $h1,
            'schema'          => TOIN_SEO_Schema::get($id),
            'canonical'       => $canonical,
            'content_excerpt' => wp_strip_all_tags(substr($post->post_content, 0, 500)),
            'seo_plugin'      => TOIN_SEO_Plugins::detect(),
        ]);
    }

    public function update_meta(WP_REST_Request $request): WP_REST_Response {
        $id     = (int) $request['id'];
        $post   = get_post($id);

        if (!$post) {
            return new WP_REST_Response(['error' => 'Post not found'], 404);
        }

        $plugin_param = sanitize_text_field((string) ($request->get_param('seo_plugin') ?? ''));
        $plugin = ($plugin_param && $plugin_param !== 'none')
            ? $plugin_param
            : TOIN_SEO_Plugins::detect();
        $title  = $request->get_param('title');
        $desc   = $request->get_param('description');

        if ($title === null && $desc === null) {
            return new WP_REST_Response(['error' => 'Provide title and/or description'], 400);
        }

        $updated = TOIN_SEO_Plugins::set_meta($id, $plugin, $title, $desc);

        return new WP_REST_Response([
            'success'        => true,
            'updated_fields' => $updated,
        ]);
    }

    public function update_schema(WP_REST_Request $request): WP_REST_Response {
        $id   = (int) $request['id'];
        $post = get_post($id);

        if (!$post) {
            return new WP_REST_Response(['error' => 'Post not found'], 404);
        }

        $schema = $request->get_param('schema_json');
        if (!is_array($schema)) {
            return new WP_REST_Response(['error' => 'schema_json must be an object'], 400);
        }

        TOIN_SEO_Schema::set($id, $schema);

        return new WP_REST_Response(['success' => true]);
    }

    public function update_canonical(WP_REST_Request $request): WP_REST_Response {
        $id   = (int) $request['id'];
        $post = get_post($id);

        if (!$post) {
            return new WP_REST_Response(['error' => 'Post not found'], 404);
        }

        $url = esc_url_raw((string) $request->get_param('canonical_url'));
        if (!$url) {
            return new WP_REST_Response(['error' => 'canonical_url is required'], 400);
        }

        update_post_meta($id, '_toin_seo_canonical', $url);

        return new WP_REST_Response(['success' => true, 'canonical_url' => $url]);
    }

    /**
     * Bulk update alt text for images.
     * Body: { images: [{src: "https://...", alt: "alt text"}] }
     * Finds attachment ID by URL, updates _wp_attachment_image_alt meta.
     */
    public function update_images_alt(WP_REST_Request $request): WP_REST_Response {
        $images = $request->get_param('images');

        if (!is_array($images) || empty($images)) {
            return new WP_REST_Response(['error' => 'images must be a non-empty array'], 400);
        }

        $updated   = 0;
        $not_found = [];

        foreach ($images as $item) {
            $src = esc_url_raw((string) ($item['src'] ?? ''));
            $alt = sanitize_text_field((string) ($item['alt'] ?? ''));

            if (!$src) continue;

            // Try exact URL first
            $attachment_id = attachment_url_to_postid($src);

            // If not found, try stripping size suffix (-300x200) from filename
            if (!$attachment_id) {
                $src_clean     = preg_replace('/-\d+x\d+(\.\w+)$/', '$1', $src);
                $attachment_id = attachment_url_to_postid($src_clean);
            }

            if ($attachment_id) {
                update_post_meta($attachment_id, '_wp_attachment_image_alt', $alt);
                $updated++;
            } else {
                $not_found[] = basename($src);
            }
        }

        return new WP_REST_Response([
            'success'   => true,
            'updated'   => $updated,
            'not_found' => $not_found,
        ]);
    }
}
