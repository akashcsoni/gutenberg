const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

// Whether the run targets the extensible site editor (v2).
const isSiteEditorV2 = !! process.env.GUTENBERG_E2E_SITE_EDITOR_V2;

test.use( {
	blockTemplateRegistrationUtils: async ( { editor, page }, use ) => {
		await use( new BlockTemplateRegistrationUtils( { editor, page } ) );
	},
} );

test.describe( 'Block template registration', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.activateTheme( 'emptytheme' );
		await requestUtils.activatePlugin(
			'gutenberg-test-block-template-registration'
		);
		// Enable the template activation feature.
		await requestUtils.setGutenbergExperiments( [ 'active_templates' ] );
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllTemplates( 'wp_template' );
		await requestUtils.deleteAllPosts();
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deactivatePlugin(
			'gutenberg-test-block-template-registration'
		);
		// Disable the template activation experiment.
		await requestUtils.setGutenbergExperiments( [] );
	} );

	test( 'templates can be registered and edited', async ( {
		admin,
		editor,
		page,
		blockTemplateRegistrationUtils,
	} ) => {
		// Verify template is applied to the frontend.
		await page.goto( '/?cat=1' );
		await expect(
			page.getByText( 'This is a plugin-registered template.' )
		).toBeVisible();

		// Verify template is listed in the Site Editor.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: isSiteEditorV2 ? 'gutenberg' : 'Gutenberg',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Template'
		);
		await expect( page.getByText( 'Plugin Template' ) ).toBeVisible();
		await expect(
			// The v2 grid also renders the description in a hidden
			// accessible-description node, so match the visible one.
			page
				.getByText( 'A template registered by a plugin.' )
				.filter( { visible: true } )
				.first()
		).toBeVisible();

		// Verify the template contents are rendered in the editor.
		await page.getByText( 'Plugin Template' ).click();
		await page.getByRole( 'button', { name: 'Duplicate' } ).click();
		if ( isSiteEditorV2 ) {
			// The classic editor redirects to the user templates view after
			// duplicating; the extensible one stays put, so wait for the
			// confirmation and navigate there explicitly.
			await page.waitForSelector( '.components-snackbar__content' );
			await admin.visitSiteEditor( {
				postType: 'wp_template',
				activeView: 'user',
			} );
		} else {
			await page.waitForURL(
				'/wp-admin/site-editor.php?p=%2Ftemplate&activeView=user'
			);
		}
		await page
			.getByRole( 'button', { name: 'Plugin Template (Copy)' } )
			.first()
			.click();
		await expect(
			editor.canvas.getByText( 'This is a plugin-registered template.' )
		).toBeVisible();

		// Verify edits persist in the frontend.
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'User-edited template' },
		} );
		await editor.saveSiteEditorEntities( {
			isOnlyCurrentEntityDirty: true,
		} );
		await page
			.getByRole( 'region', { name: 'Editor content' } )
			.getByRole( 'button', { name: 'Activate' } )
			.click();
		await expect(
			page
				.getByRole( 'region', { name: 'Editor content' } )
				.getByText( 'Template activated.' )
		).toBeVisible();
		await page.goto( '/?cat=1' );
		await expect( page.getByText( 'User-edited template' ) ).toBeVisible();

		// Verify template can be reset.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: 'user',
		} );
		const resetNotice = page
			.getByLabel( 'Dismiss this notice' )
			.getByText( `"Plugin Template (Copy)" moved to the trash.` );
		const savedButton = page.getByRole( 'button', {
			name: 'Saved',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Template'
		);
		const searchResults = page.getByLabel( 'Actions' );
		await searchResults.first().click();
		await page.getByRole( 'menuitem', { name: 'Trash' } ).click();
		await page.getByRole( 'button', { name: 'Trash' } ).click();

		await expect( resetNotice ).toBeVisible();
		if ( ! isSiteEditorV2 ) {
			// Only the classic editor shows the save hub on list screens.
			await expect( savedButton ).toBeVisible();
		}
		await page.goto( '/?cat=1' );
		await expect(
			page.getByText( 'Content edited template.' )
		).toBeHidden();
	} );

	test( 'registered templates are available in the Change template screen', async ( {
		admin,
		editor,
		page,
	} ) => {
		// Create a post.
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'User-created post.' },
		} );

		// Change template.
		await editor.openDocumentSettingsSidebar();
		await page.getByRole( 'button', { name: 'Post', exact: true } ).click();
		await page.getByRole( 'button', { name: 'Template options' } ).click();
		await page.getByRole( 'menuitem', { name: 'Change template' } ).click();
		await page.getByText( 'Plugin Template' ).click();

		// Verify the template is applied.
		const postId = await editor.publishPost();
		await page.goto( `?p=${ postId }` );
		await expect(
			page.getByText( 'This is a plugin-registered template.' )
		).toBeVisible();
	} );

	test( 'themes can override registered templates', async ( {
		admin,
		editor,
		page,
		blockTemplateRegistrationUtils,
	} ) => {
		// Create a post.
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'User-created post.' },
		} );

		// Change template.
		await editor.openDocumentSettingsSidebar();
		await page.getByRole( 'button', { name: 'Post', exact: true } ).click();
		await page.getByRole( 'button', { name: 'Template options' } ).click();
		await page.getByRole( 'menuitem', { name: 'Change template' } ).click();
		await page.getByText( 'Custom', { exact: true } ).click();

		// Verify the theme template is applied.
		const postId = await editor.publishPost();
		await page.goto( `?p=${ postId }` );
		await expect(
			page.getByText( 'Custom template for Posts' )
		).toBeVisible();
		await expect(
			page.getByText(
				'This is a plugin-registered template and overridden by a theme.'
			)
		).toBeHidden();

		// Verify the plugin-registered template doesn't appear in the Site Editor.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: 'Emptytheme',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate( 'Custom' );
		await expect(
			page.getByText( 'Custom Template (overridden by the theme)' )
		).toBeHidden();
		// Verify the template description fall backs to the plugin registered description.
		await expect(
			page
				.getByText(
					'A custom template registered by a plugin and overridden by a theme.'
				)
				// The v2 grid also renders the description in a hidden
				// accessible-description node, so match the visible one.
				.filter( { visible: true } )
				.first()
		).toBeVisible();
	} );

	test( 'templates can be deleted if the registered plugin is deactivated', async ( {
		admin,
		editor,
		page,
		requestUtils,
		blockTemplateRegistrationUtils,
	} ) => {
		// Make an edit to the template.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: isSiteEditorV2 ? 'gutenberg' : 'Gutenberg',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Template'
		);
		await page.getByText( 'Plugin Template' ).click();
		await page.getByRole( 'button', { name: 'Duplicate' } ).click();
		if ( isSiteEditorV2 ) {
			// The classic editor redirects to the user templates view after
			// duplicating; the extensible one stays put, so wait for the
			// confirmation and navigate there explicitly.
			await page.waitForSelector( '.components-snackbar__content' );
			await admin.visitSiteEditor( {
				postType: 'wp_template',
				activeView: 'user',
			} );
		} else {
			await page.waitForURL(
				'/wp-admin/site-editor.php?p=%2Ftemplate&activeView=user'
			);
		}
		await page
			.getByRole( 'button', { name: 'Plugin Template (Copy)' } )
			.first()
			.click();
		await expect(
			editor.canvas.getByText( 'This is a plugin-registered template.' )
		).toBeVisible();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'User-customized template' },
		} );
		await editor.saveSiteEditorEntities( {
			isOnlyCurrentEntityDirty: true,
		} );

		// Deactivate plugin.
		await requestUtils.deactivatePlugin(
			'gutenberg-test-block-template-registration'
		);

		// Verify template can be deleted.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: 'user',
		} );
		const deletedNotice = page
			.getByLabel( 'Dismiss this notice' )
			.getByText( `"Plugin Template (Copy)" moved to the trash.` );
		const savedButton = page.getByRole( 'button', {
			name: 'Saved',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Template'
		);
		const searchResults = page.getByLabel( 'Actions' );
		await searchResults.first().click();
		await page.getByRole( 'menuitem', { name: 'Trash' } ).click();
		await page.getByRole( 'button', { name: 'Trash' } ).click();

		await expect( deletedNotice ).toBeVisible();
		if ( ! isSiteEditorV2 ) {
			// Only the classic editor shows the save hub on list screens.
			await expect( savedButton ).toBeVisible();
		}

		// Expect template to no longer appear in the Site Editor.
		await expect( page.getByLabel( 'Actions' ) ).toBeHidden();

		// Reactivate plugin.
		await requestUtils.activatePlugin(
			'gutenberg-test-block-template-registration'
		);
	} );

	test( 'registered templates can be unregistered', async ( {
		admin,
		page,
		blockTemplateRegistrationUtils,
	} ) => {
		await admin.visitSiteEditor( {
			postType: 'wp_template',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Unregistered Template'
		);
		await expect(
			page.getByText( 'Plugin Unregistered Template' )
		).toBeHidden();
	} );

	test( 'WP default templates can be overridden by plugins', async ( {
		page,
		requestUtils,
	} ) => {
		const { id } = await requestUtils.createPage( {
			title: 'Plugin override page',
			status: 'publish',
		} );
		await page.goto( `?page_id=${ id }` );
		await expect(
			page.getByText( 'This is a plugin-registered page template.' )
		).toBeVisible();
	} );

	test( 'user-customized templates cannot be overridden by plugins', async ( {
		admin,
		editor,
		page,
		requestUtils,
		blockTemplateRegistrationUtils,
	} ) => {
		await requestUtils.deactivatePlugin(
			'gutenberg-test-block-template-registration'
		);

		// Create an author template.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
		} );
		await page.getByLabel( 'Add template' ).click();
		await page.getByRole( 'button', { name: 'Author Archives' } ).click();
		await page
			.getByRole( 'button', { name: 'Author For a specific item' } )
			.click();
		await page.getByRole( 'option', { name: 'admin' } ).click();
		await expect( page.getByText( 'Choose a pattern' ) ).toBeVisible();
		await page.getByLabel( 'Close', { exact: true } ).click();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'Author template customized by the user.' },
		} );
		await editor.saveSiteEditorEntities( {
			isOnlyCurrentEntityDirty: true,
		} );
		await page
			.getByRole( 'region', { name: 'Editor content' } )
			.getByRole( 'button', { name: 'Activate' } )
			.click();
		await expect(
			page
				.getByRole( 'region', { name: 'Editor content' } )
				.getByText( 'Template activated.' )
		).toBeVisible();

		await requestUtils.activatePlugin(
			'gutenberg-test-block-template-registration'
		);

		// Verify the template edited by the user has priority over the one registered by the theme.
		await page.goto( '?author=1' );
		await expect(
			page.getByText( 'Author template customized by the user.' )
		).toBeVisible();
		await expect(
			page.getByText( 'This is a plugin-registered author template.' )
		).toBeHidden();

		// Verify the template registered by the plugin is not visible in the Site Editor.
		await admin.visitSiteEditor( {
			postType: 'wp_template',
		} );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Plugin Author Template'
		);
		await expect( page.getByText( 'Plugin Author Template' ) ).toBeHidden();

		await admin.visitSiteEditor( {
			postType: 'wp_template',
			activeView: 'user',
		} );

		// Reset the user-modified template.
		const resetNotice = page
			.getByLabel( 'Dismiss this notice' )
			.getByText( `"Author: Admin" moved to the trash.` );
		await blockTemplateRegistrationUtils.searchForTemplate(
			'Author: admin'
		);
		const actions = page.getByLabel( 'Actions' );
		await actions.first().click();
		await page.getByRole( 'menuitem', { name: 'Trash' } ).click();
		await page.getByRole( 'button', { name: 'Trash' } ).click();

		await expect( resetNotice ).toBeVisible();

		await page.goto( '?author=1' );
		await expect(
			page.getByText( 'Author template customized by the user.' )
		).toBeHidden();
		await expect(
			page.getByText( 'This is a plugin-registered author template.' )
		).toBeVisible();
	} );
} );

class BlockTemplateRegistrationUtils {
	constructor( { page } ) {
		this.page = page;
	}

	async searchForTemplate( searchTerm ) {
		const searchResults = this.page.getByLabel( 'Actions' );
		// The list is fetched client-side after the route loads, which can
		// take a while on slower CI runners.
		await expect
			.poll( async () => await searchResults.count(), {
				timeout: 15_000,
			} )
			.toBeGreaterThan( 0 );
		const initialSearchResultsCount = await searchResults.count();
		await this.page.getByPlaceholder( 'Search' ).fill( searchTerm );
		await expect
			.poll( async () => await searchResults.count() )
			.toBeLessThanOrEqual( initialSearchResultsCount );
		// Normalise the URL before matching: the extensible site editor nests
		// the route query inside the `p` param (encoding it a second time) and
		// encodes spaces as `+`.
		await expect
			.poll( async () =>
				decodeURIComponent(
					decodeURIComponent( this.page.url() )
				).replace( /\+/g, ' ' )
			)
			.toContain( `search=${ searchTerm }` );
	}
}
