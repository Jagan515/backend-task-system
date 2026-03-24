import {AuthenticationComponent} from '@loopback/authentication';
import {
  JWTAuthenticationComponent,
  TokenServiceBindings,
  TokenServiceConstants,
  UserServiceBindings,
} from '@loopback/authentication-jwt';
import {
  AuthorizationComponent,
  AuthorizationDecision,
  AuthorizationContext,
  AuthorizationMetadata,
  AuthorizationTags,
} from '@loopback/authorization';
import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {DbDataSource} from './datasources';
import {MySequence} from './sequence';

import {AuditService, ReminderService, MyJWTService} from './services';

export {ApplicationConfig};

export class BackendApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    // Configure CORS
    this.options.rest = {
      ...this.options.rest,
      cors: {
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        maxAge: 86400,
        credentials: true,
      },
    };

    // Mount authentication system
    this.component(AuthenticationComponent);
    // Mount jwt component
    this.component(JWTAuthenticationComponent);
    // Mount authorization system
    this.component(AuthorizationComponent);

    // Register a basic authorizer
    this.bind('authorizationProviders.basic')
      .to(this.basicAuthorizer.bind(this))
      .tag(AuthorizationTags.AUTHORIZER);

    // Bind custom services
    this.bind('services.AuditService').toClass(AuditService);
    this.bind('services.ReminderService').toClass(ReminderService);

    // Bind custom JWT service to override default
    this.bind(TokenServiceBindings.TOKEN_SERVICE).toClass(MyJWTService);

    // Bind datasource
    this.dataSource(DbDataSource, UserServiceBindings.DATASOURCE_NAME);

    // Bind JWT secret and expires in
    this.bind(TokenServiceBindings.TOKEN_SECRET).to(
      process.env.JWT_SECRET ?? TokenServiceConstants.TOKEN_SECRET_VALUE,
    );
    this.bind(TokenServiceBindings.TOKEN_EXPIRES_IN).to(
      process.env.JWT_EXPIRES_IN ??
        TokenServiceConstants.TOKEN_EXPIRES_IN_VALUE,
    );
  }

  // Basic RBAC Authorizer
  async basicAuthorizer(
    context: AuthorizationContext,
    metadata: AuthorizationMetadata,
  ): Promise<AuthorizationDecision> {
    const user = context.principals[0];
    const userRole = user?.role;
    const allowedRoles = metadata.allowedRoles;

    console.log(
      `[Authorizer] User Role: ${userRole}, Allowed Roles: ${JSON.stringify(allowedRoles)}`,
    );

    if (!allowedRoles || allowedRoles.length === 0) {
      return AuthorizationDecision.ALLOW;
    }

    if (userRole && allowedRoles.includes(userRole)) {
      console.log(`[Authorizer] Access ALLOWED`);
      return AuthorizationDecision.ALLOW;
    }

    console.log(`[Authorizer] Access DENIED`);
    return AuthorizationDecision.DENY;
  }
}
