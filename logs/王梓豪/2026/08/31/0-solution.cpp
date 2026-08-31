#include <bits/stdc++.h>
using namespace std;
int main()
{
    string s;
    cin>>s;
    stack<int> st;
    int num = 0;
    for (char c : s)
    {
        if (c>='0'&&c<= '9')
        {
            num = num*10+(c-'0');
        }
        else if (c=='.')
        {
            st.push(num);
            num=0;
        }
        else if (c=='+'||c =='-'||c =='*'||c =='/')
        {
            int b = st.top(); st.pop();
            int a = st.top(); st.pop();
            int res;
            if (c == '+') res = a + b;
            else if (c == '-') res = a - b;
            else if (c == '*') res = a * b;
            else res = a / b;
            st.push(res);
        }
        else if (c == '@')
        {
            break;
        }
    }
    cout << st.top() << endl;
    return 0;
}