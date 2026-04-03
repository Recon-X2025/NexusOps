# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend-chaos.spec.ts >> Frontend Chaos — NexusOps >> chaos worker 14
- Location: tests/frontend-chaos.spec.ts:280:9

# Error details

```
Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - img [ref=e6]
      - heading "NexusOps" [level=1] [ref=e8]
      - paragraph [ref=e9]: by Coheron
    - generic [ref=e10]:
      - heading "Welcome back" [level=2] [ref=e11]
      - paragraph [ref=e12]: Sign in to your workspace
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: Email
          - textbox "you@company.com" [ref=e16]
        - generic [ref=e17]:
          - generic [ref=e18]: Password
          - generic [ref=e19]:
            - textbox "••••••••" [ref=e20]
            - button [active] [ref=e21] [cursor=pointer]:
              - img [ref=e22]
        - generic [ref=e27]:
          - generic [ref=e28]:
            - checkbox "Remember me" [ref=e29]
            - text: Remember me
          - link "Forgot password?" [ref=e30] [cursor=pointer]:
            - /url: /forgot-password
        - button "Sign in" [ref=e31] [cursor=pointer]
      - generic [ref=e32]:
        - generic [ref=e37]: or continue with
        - button "Continue with Google" [ref=e38] [cursor=pointer]:
          - img [ref=e39]
          - text: Continue with Google
    - paragraph [ref=e44]:
      - text: Don't have an account?
      - link "Sign up free" [ref=e45] [cursor=pointer]:
        - /url: /signup
  - region "Notifications alt+T"
  - alert [ref=e46]
```