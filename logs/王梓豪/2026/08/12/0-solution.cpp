#include <bits/stdc++.h>
using namespace std;
void devide(string a,int n)
{int carry=0;string ans="";
    for(int i=0;i<a.size();i++)
    {
        int r=carry*10+a[i]-'0';
        ans+=r/n+'0';
        carry=r%n;
    }
    int i=0;
    while(ans[i]=='0'&&i<a.size()&&a.size()>1)
        {ans.erase(ans.begin()+i);i++;}
    cout<<ans<<' '<<carry;
}
int main()
{
    string s;
    int n;
    cin>>s>>n;
    devide(s,n);
    cin>>n;
}